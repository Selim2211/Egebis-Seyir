import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateSpaceRequestSchema,
  MAX_ATTACHMENTS_PER_ITEM,
  formatItemKey,
  type RichTextNode,
} from '@scrum/shared';
import type { ParsedMail } from 'mailparser';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import type { Env } from '../../infra/config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AttachmentsService } from '../collab/attachments.service';
import { SpacesService } from '../spaces/spaces.service';
import { BugsService } from '../work-items/bugs.service';
import { asJson } from '../work-items/item-support';
import { TicketCompaniesService } from './ticket-companies.service';
import { TicketConfigService } from './ticket-config.service';
import { TicketRepliesService } from './ticket-replies.service';
import {
  MAIL_CUSTOMER_PREFIX,
  MAIL_SUPPORT_PREFIX,
  htmlToText,
  isAutomatedMail,
  plainOf,
  stripQuotedReply,
  textToRichText,
  ticketTitle,
} from './ticket-mail';

export type IngestResult = 'created' | 'reply' | 'duplicate' | 'ignored';

const INBOX_KEYS = ['CGR', 'CAGRI', 'INBOX'];

/**
 * Çağrı sistemi (ADR-138): gelen kutusundan okunan e-postayı Bug'a çevirir. Konu → başlık, metin → açıklama,
 * dosyalar → ekler; gönderen ve zaman `InboundEmail` kaydında durur. Aynı Message-ID iki kez işlenmez.
 * Müşterinin yanıtı mevcut Bug'a yorum olarak eklenir.
 */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: ConfigService<Env, true>,
    private readonly spaces: SpacesService,
    private readonly bugs: BugsService,
    private readonly attachments: AttachmentsService,
    private readonly cfg: TicketConfigService,
    private readonly companies: TicketCompaniesService,
    private readonly replies: TicketRepliesService,
  ) {}

  /** NODE_ENV=test iken otomatik yanıtlar gerçekten gönderilmez, burada birikir (yalnızca testler). */
  get outbox() {
    return this.replies.outbox;
  }

  /** Klasör imleci: en son işlenen UID ve klasörün UIDVALIDITY değeri (yoksa null). */
  async cursor(box: 'inbox' | 'sent'): Promise<{ uid: number | null; validity: bigint | null }> {
    const row = await this.prisma.appSettings.findUnique({ where: { id: 1 } });
    return box === 'inbox'
      ? { uid: row?.ticketsLastUid ?? null, validity: row?.ticketsUidValidity ?? null }
      : { uid: row?.ticketsSentUid ?? null, validity: row?.ticketsSentValidity ?? null };
  }

  async saveCursor(box: 'inbox' | 'sent', uid: number, validity: bigint): Promise<void> {
    const data =
      box === 'inbox'
        ? { ticketsLastUid: uid, ticketsUidValidity: validity }
        : { ticketsSentUid: uid, ticketsSentValidity: validity };
    await this.prisma.appSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
  }

  /** Gelen kutusunun bağlı olduğu workspace ve onun adına işlem yapacak sahip kullanıcı. */
  async target(): Promise<{ workspaceId: string; actorId: string } | null> {
    const wanted = this.config.get('TICKET_WORKSPACE_ID', { infer: true });
    const workspace = wanted
      ? await this.prisma.workspace.findUnique({ where: { id: wanted }, select: { id: true } })
      : await this.prisma.workspace.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
    if (!workspace) return null;
    const owner = await this.prisma.membership.findFirst({
      where: { workspaceId: workspace.id, role: { key: 'OWNER' } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    return owner ? { workspaceId: workspace.id, actorId: owner.userId } : null;
  }

  /** Tenant istemcisinin ihtiyaç duyduğu bağlamı kurar (arka plan işi istek bağlamına sahip değildir). */
  private runAs<T>(workspaceId: string, actorId: string, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set('workspaceId', workspaceId);
      this.cls.set('userId', actorId);
      this.cls.set('workspaceRole', 'OWNER');
      return fn();
    });
  }

  /** Gelen kutusu Projesi ve "Belirsiz" listesi; yoksa oluşturulur (Workspace başına bir tane). */
  private async inbox(workspaceId: string, actorId: string) {
    const found = await this.prisma.space.findFirst({
      where: { workspaceId, ticketInbox: true, deletedAt: null },
      select: { id: true, key: true },
    });
    const spaceId =
      found?.id ??
      (await this.runAs(workspaceId, actorId, async () => {
        for (const key of INBOX_KEYS) {
          if (await this.prisma.spaceKey.findFirst({ where: { workspaceId, key } })) continue;
          const created = await this.spaces.create(
            CreateSpaceRequestSchema.parse({
              name: 'Gelen Çağrılar',
              key,
              color: '#DC2626',
              description: 'E-postadan gelen müşteri çağrıları. Bug’ı doğru Projeye taşıyın.',
              isPrivate: true,
              scrumEnabled: true,
            }),
          );
          await this.prisma.space.update({
            where: { id: created.id },
            data: { ticketInbox: true },
          });
          return created.id;
        }
        throw new Error('Gelen kutusu Projesi için boş anahtar bulunamadı');
      }));
    const list = await this.prisma.list.findFirst({
      where: { spaceId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (!list) throw new Error('Gelen kutusu Projesinde liste yok');
    if (list.name !== 'Belirsiz') {
      await this.prisma.list.update({ where: { id: list.id }, data: { name: 'Belirsiz' } });
    }
    return { spaceId, listId: list.id };
  }

  /** E-postayı işler. Hata fırlatırsa çağıran e-postayı okunmamış bırakır (yeniden denenir). */
  async ingest(mail: ParsedMail, rawSource: Buffer, serverDate: Date): Promise<IngestResult> {
    // Gönderim zamanı için e-postanın kendi Date başlığı (saat dilimiyle) önceliklidir; bazı posta sunucularının iç tarihi
    // saat dilimini yanlış işaretler. Başlık yoksa ya da gelecekteyse sunucu tarihi kullanılır.
    const sent = mail.date && !Number.isNaN(mail.date.getTime()) ? mail.date : null;
    const receivedAt = sent && sent.getTime() <= Date.now() + 300_000 ? sent : serverDate;
    const target = await this.target();
    if (!target) return 'ignored';
    const { workspaceId, actorId } = target;
    const rt = await this.cfg.effective(workspaceId);

    const sender = mail.from?.value[0];
    const fromEmail = sender?.address?.toLowerCase();
    if (!fromEmail) return 'ignored';
    const fromName = sender?.name?.trim() || fromEmail.split('@')[0]!;
    const messageId =
      mail.messageId ?? `<${createHash('sha256').update(rawSource).digest('hex')}@ticket.local>`;

    if (
      await this.prisma.inboundEmail.findUnique({
        where: { workspaceId_messageId: { workspaceId, messageId } },
        select: { id: true },
      })
    ) {
      return 'duplicate';
    }

    const headers = new Map<string, string>();
    for (const [name, value] of mail.headers) {
      headers.set(name.toLowerCase(), typeof value === 'string' ? value : JSON.stringify(value));
    }
    const automated = isAutomatedMail({ fromEmail, headers, ownAddress: rt.address });
    if (automated) {
      this.logger.log(`Otomatik e-posta atlandı: ${fromEmail}`);
      return 'ignored';
    }

    const rawText = (mail.text ?? '').trim() || (mail.html ? htmlToText(mail.html) : '');
    const reporter = await this.prisma.user.findFirst({
      where: { email: fromEmail, memberships: { some: { workspaceId } } },
      select: { id: true },
    });

    // Yanıt: Message-ID ya da bizim otomatik yanıtımızın Message-ID'si ile eşleşir.
    const refs = [
      mail.inReplyTo,
      ...(Array.isArray(mail.references) ? mail.references : []),
    ].filter((r): r is string => typeof r === 'string' && r !== '');
    const parent =
      refs.length > 0
        ? await this.prisma.inboundEmail.findFirst({
            where: {
              workspaceId,
              OR: [{ messageId: { in: refs } }, { ackMessageId: { in: refs } }],
              workItem: { deletedAt: null },
            },
            select: { workItemId: true, workItem: { select: { spaceId: true } } },
          })
        : null;

    const files = mail.attachments.filter(
      // İmzadaki küçük satır içi görseller (logo vb.) Bug eki olmaz.
      (a) => !(a.related && a.size < 30_000) && a.content.length > 0,
    );

    if (parent) {
      const itemId = parent.workItemId;
      const body = stripQuotedReply(rawText);
      const failed = await this.attach(workspaceId, actorId, itemId, files);
      const doc = this.mailDoc(`${MAIL_CUSTOMER_PREFIX} ${fromName} <${fromEmail}>`, body, failed);
      await this.commentOnThread(workspaceId, itemId, reporter?.id ?? null, doc);
      await this.prisma.inboundEmail.create({
        data: {
          workspaceId,
          workItemId: itemId,
          kind: 'REPLY',
          messageId,
          fromName,
          fromEmail,
          subject: (mail.subject ?? '').slice(0, 500),
          receivedAt,
          userId: reporter?.id ?? null,
        },
      });
      this.logger.log(`Yanıt e-postası ${fromEmail} → mevcut Bug'a yorum olarak eklendi`);
      return 'reply';
    }

    // Firma (domain'den) ve atama (kural → firma varsayılanı → gelen kutusu); gerekçe günlüğe yazılır.
    const company = await this.companies.resolve(workspaceId, fromEmail);
    const routing = await this.companies.route(workspaceId, company, mail.subject ?? '', rawText);
    const box = routing.spaceId ? null : await this.inbox(workspaceId, actorId);
    const description = textToRichText(rawText);
    const bug = await this.runAs(workspaceId, actorId, () =>
      this.bugs.create((routing.spaceId ?? box?.spaceId)!, {
        title: ticketTitle(mail.subject),
        ...(box ? { listId: box.listId } : {}),
        severity: 'MAJOR',
        priority: 'NORMAL',
      }),
    );
    await this.prisma.workItem.update({
      where: { id: bug.id },
      data: {
        description: asJson(description),
        descriptionText: plainOf(description),
        // E-postayı yazan Seyir kullanıcısıysa Bug onun; değilse sahipsiz (gönderen kartta görünür).
        reporterId: reporter?.id ?? null,
      },
    });
    const failed = await this.attach(workspaceId, actorId, bug.id, files);
    if (failed.length > 0) {
      const note = textToRichText(
        `Şu dosyalar Bug’a eklenemedi (boyut/tür sınırı):\n${failed.join('\n')}`,
      );
      await this.prisma.comment.create({
        data: {
          workspaceId,
          workItemId: bug.id,
          authorId: null,
          body: asJson(note),
          bodyText: plainOf(note),
        },
      });
    }

    const ackMessageId = `<ack-${randomUUID()}@${rt.address.split('@')[1] ?? 'ticket.local'}>`;
    await this.prisma.inboundEmail.create({
      data: {
        workspaceId,
        workItemId: bug.id,
        kind: 'NEW',
        messageId,
        ackMessageId,
        fromName,
        fromEmail,
        subject: (mail.subject ?? '').slice(0, 500),
        receivedAt,
        userId: reporter?.id ?? null,
        companyId: company?.company.id ?? null,
        rootCompanyId: company?.root.id ?? null,
        routedSpaceId: routing.spaceId,
        routedSpaceName: routing.spaceName ?? (box ? 'Gelen Çağrılar (Belirsiz)' : null),
        routeReason: routing.reason,
      },
    });
    this.logger.log(`E-posta Bug oldu: ${bug.key} ← ${fromEmail}`);

    try {
      await this.replies.send('ack', {
        workspaceId,
        to: fromEmail,
        name: fromName,
        key: bug.key,
        subject: mail.subject,
        messageId,
        replyMessageId: ackMessageId,
        company: company?.root.name,
        project: routing.spaceName ?? undefined,
      });
    } catch (error) {
      // Yanıt gönderilemese de Bug oluştu; hata yalnızca günlüğe yazılır.
      this.logger.warn(`Otomatik yanıt gönderilemedi (${fromEmail}): ${(error as Error).message}`);
    }
    return 'created';
  }

  /**
   * Gönderilmiş Öğeler klasöründeki e-posta: bizim bir çağrıya verdiğimiz yanıt (Outlook/webmail'den). Yazışmanın
   * (In-Reply-To/References) bilinen bir çağrıya bağlıysa "Destek yanıtı" olarak Bug'ın ve ondan çevrilen
   * Task'ların yorumlarına eklenir; bağlı değilse yok sayılır (çağrıyla ilgisiz giden e-postalar).
   */
  async ingestSent(mail: ParsedMail, rawSource: Buffer, serverDate: Date): Promise<IngestResult> {
    const target = await this.target();
    if (!target) return 'ignored';
    const { workspaceId, actorId } = target;
    const rt = await this.cfg.effective(workspaceId);
    const messageId =
      mail.messageId ?? `<${createHash('sha256').update(rawSource).digest('hex')}@ticket.local>`;
    if (
      await this.prisma.inboundEmail.findUnique({
        where: { workspaceId_messageId: { workspaceId, messageId } },
        select: { id: true },
      })
    ) {
      return 'duplicate';
    }
    // Otomatik yanıtlarımız (talebiniz alındı) ve sistem e-postaları yazışmaya yorum olarak eklenmez.
    const autoSubmitted = mail.headers.get('auto-submitted');
    if (typeof autoSubmitted === 'string' && autoSubmitted.toLowerCase() !== 'no') return 'ignored';

    const refs = [
      mail.inReplyTo,
      ...(Array.isArray(mail.references) ? mail.references : []),
    ].filter((r): r is string => typeof r === 'string' && r !== '');
    if (refs.length === 0) return 'ignored';
    const parent = await this.prisma.inboundEmail.findFirst({
      where: {
        workspaceId,
        OR: [{ messageId: { in: refs } }, { ackMessageId: { in: refs } }],
        workItem: { deletedAt: null },
      },
      select: { workItemId: true },
    });
    if (!parent) return 'ignored';

    const sender = mail.from?.value[0];
    const fromEmail = sender?.address?.toLowerCase() ?? rt.address;
    const fromName = sender?.name?.trim() || fromEmail.split('@')[0]!;
    const recipients = (Array.isArray(mail.to) ? mail.to : mail.to ? [mail.to] : [])
      .flatMap((group) => group.value.map((v) => v.address))
      .filter((a): a is string => !!a);
    const sent = mail.date && !Number.isNaN(mail.date.getTime()) ? mail.date : null;
    const receivedAt = sent && sent.getTime() <= Date.now() + 300_000 ? sent : serverDate;
    const rawText = (mail.text ?? '').trim() || (mail.html ? htmlToText(mail.html) : '');
    const files = mail.attachments.filter(
      (a) => !(a.related && a.size < 30_000) && a.content.length > 0,
    );
    const staff = await this.prisma.user.findFirst({
      where: { email: fromEmail, memberships: { some: { workspaceId } } },
      select: { id: true },
    });

    const failed = await this.attach(workspaceId, actorId, parent.workItemId, files);
    const header = `${MAIL_SUPPORT_PREFIX} ${fromName}${recipients.length > 0 ? ` → ${recipients.join(', ')}` : ''}`;
    const doc = this.mailDoc(header, stripQuotedReply(rawText), failed);
    await this.commentOnThread(workspaceId, parent.workItemId, staff?.id ?? null, doc);
    await this.prisma.inboundEmail.create({
      data: {
        workspaceId,
        workItemId: parent.workItemId,
        kind: 'OUTBOUND',
        messageId,
        fromName,
        fromEmail,
        subject: (mail.subject ?? '').slice(0, 500),
        receivedAt,
        userId: staff?.id ?? null,
      },
    });
    this.logger.log(`Destek yanıtı yazışmaya eklendi (${recipients.join(', ') || 'alıcı yok'})`);
    return 'reply';
  }

  /** Yazışma yorumu: çağrının Bug'ına ve ondan çevrilen (silinmemiş) tüm Task'lara aynen yazılır. */
  private async commentOnThread(
    workspaceId: string,
    bugId: string,
    authorId: string | null,
    doc: RichTextNode,
  ): Promise<void> {
    const tasks = await this.prisma.workItem.findMany({
      where: { sourceBugId: bugId, deletedAt: null },
      select: { id: true },
    });
    await this.prisma.comment.createMany({
      data: [bugId, ...tasks.map((t) => t.id)].map((workItemId) => ({
        workspaceId,
        workItemId,
        authorId,
        body: asJson(doc),
        bodyText: plainOf(doc),
      })),
    });
  }

  private mailDoc(header: string, body: string, failed: string[]): RichTextNode {
    const content: RichTextNode[] = [
      { type: 'paragraph', content: [{ type: 'text', text: header, marks: [{ type: 'bold' }] }] },
      ...(textToRichText(body).content ?? []),
    ];
    if (failed.length > 0) {
      content.push(...(textToRichText(`Eklenemeyen dosyalar: ${failed.join(', ')}`).content ?? []));
    }
    return { type: 'doc', content };
  }

  /** Dosyaları Bug'a ekler; eklenemeyenlerin adlarını döner. */
  private async attach(
    workspaceId: string,
    actorId: string,
    itemId: string,
    files: ParsedMail['attachments'],
  ): Promise<string[]> {
    const failed: string[] = [];
    let slots = MAX_ATTACHMENTS_PER_ITEM;
    for (const [index, file] of files.entries()) {
      const name = file.filename?.trim() || `ek-${index + 1}`;
      if (slots <= 0) {
        failed.push(name);
        continue;
      }
      try {
        await this.runAs(workspaceId, actorId, () =>
          this.attachments.upload(itemId, {
            // Multer dosya adını latin1 olarak çözülmüş verir; servis bunu geri UTF-8'e çevirir.
            originalname: Buffer.from(name, 'utf8').toString('latin1'),
            buffer: file.content,
            size: file.content.length,
          } as Express.Multer.File),
        );
        slots -= 1;
      } catch (error) {
        this.logger.warn(`Ek eklenemedi (${name}): ${(error as Error).message}`);
        failed.push(name);
      }
    }
    return failed;
  }
}

export { formatItemKey };
