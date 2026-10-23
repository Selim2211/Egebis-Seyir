import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  formatItemKey,
  renderTicketTemplate,
  type TicketPlaceholder,
  type TicketTemplateKey,
} from '@scrum/shared';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../infra/config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TicketConfigService, type TicketRuntime } from './ticket-config.service';
import { ticketTitle } from './ticket-mail';

/** Aynı göndericiye saatte en çok bu kadar "talebiniz alındı" yanıtı gider. */
const ACK_PER_SENDER_PER_HOUR = 3;
/** Saatte en çok bu kadar "talebiniz alındı" yanıtı (tüm göndericiler toplamı). */
const ACK_PER_HOUR = 12;
/** Saatte en çok bu kadar süreç yanıtı (işleme alındı + çözüldü). */
const STAGE_PER_HOUR = 30;
const HOUR_MS = 3_600_000;
/** Bu süreden eski çağrılar için süreç yanıtı gönderilmez (eski kayıtlar bir anda yanıt yağdırmasın). */
const SWEEP_WINDOW_DAYS = 60;

export interface ReplyContext {
  workspaceId: string;
  to: string;
  name: string;
  key: string;
  subject: string | undefined;
  /** Müşterinin ilk e-postasının Message-ID'si: yanıt zincirine (In-Reply-To) bağlanır. */
  messageId: string;
  /** İlk yanıtın önceden üretilmiş Message-ID'si (müşterinin cevabını Bug'a bağlamak için). */
  replyMessageId?: string;
  company?: string;
  project?: string;
  assignee?: string;
}

export type SendOutcome = 'sent' | 'skipped' | 'deferred';

/**
 * Müşteriye giden süreç yanıtları (ADR-140): talebiniz alındı, işleme alındı (Task'a çevrildi + sprint + kişi),
 * çözüldü. Metinler ayarlardaki şablonlardan gelir. Sistem döngüye girmesin diye saatlik sınırlar vardır; testte
 * (`NODE_ENV=test`) hiçbir şey gerçekten gönderilmez, `outbox`'a düşer.
 */
@Injectable()
export class TicketRepliesService {
  private readonly logger = new Logger(TicketRepliesService.name);
  private transporter?: { key: string; value: Transporter };
  private readonly stageSent: number[] = [];
  readonly outbox: Array<{
    kind: TicketTemplateKey;
    to: string;
    subject: string;
    text: string;
    inReplyTo: string;
  }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: TicketConfigService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private render(kind: TicketTemplateKey, rt: TicketRuntime, ctx: ReplyContext) {
    const values: Partial<Record<TicketPlaceholder, string>> = {
      ad: ctx.name.split(' ')[0] ?? ctx.name,
      firma: ctx.company ?? '',
      kayitNo: ctx.key,
      konu: ticketTitle(ctx.subject),
      proje: ctx.project ?? '',
      atanan: ctx.assignee ?? '',
      sirketAdi: rt.org.name,
      telefon: rt.org.phone,
      web: rt.org.website,
      imza: rt.org.signature,
    };
    const t = rt.templates[kind];
    return {
      subject: renderTicketTemplate(t.subject, values).replace(/\s+/g, ' '),
      text: renderTicketTemplate(t.body, values),
    };
  }

  private mailer(rt: TicketRuntime): Transporter | null {
    if (!rt.smtp || !rt.user || !rt.pass) return null;
    const key = JSON.stringify([rt.smtp, rt.user, rt.pass]);
    if (this.transporter?.key !== key) {
      this.transporter?.value.close();
      this.transporter = {
        key,
        value: createTransport({
          host: rt.smtp.host,
          port: rt.smtp.port,
          secure: rt.smtp.secure,
          auth: { user: rt.user, pass: rt.pass },
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        }),
      };
    }
    return this.transporter.value;
  }

  /** Şablonla yanıt gönderir. skipped: kapalı/uygun değil (tekrar denenmez) · deferred: sınır doldu (sonra denenir). */
  async send(kind: TicketTemplateKey, ctx: ReplyContext): Promise<SendOutcome> {
    const rt = await this.cfg.effective(ctx.workspaceId);
    if (!rt.autoReply || !rt.templates[kind].enabled) return 'skipped';
    if (ctx.to === rt.address) return 'skipped';

    if (kind === 'ack') {
      const since = new Date(Date.now() - HOUR_MS);
      const [mine, all] = await Promise.all([
        this.prisma.inboundEmail.count({
          where: {
            workspaceId: ctx.workspaceId,
            fromEmail: ctx.to,
            kind: 'NEW',
            createdAt: { gte: since },
          },
        }),
        this.prisma.inboundEmail.count({
          where: { workspaceId: ctx.workspaceId, kind: 'NEW', createdAt: { gte: since } },
        }),
      ]);
      // Sahte göndericili toplu e-posta, var olmayan adreslere yanıt yağdırıp posta sağlayıcısının
      // "saatte 30 başarısız teslimat" kuralıyla kutuyu kilitlemesin.
      if (mine > ACK_PER_SENDER_PER_HOUR || all > ACK_PER_HOUR) return 'deferred';
    } else {
      const cutoff = Date.now() - HOUR_MS;
      while (this.stageSent.length > 0 && this.stageSent[0]! < cutoff) this.stageSent.shift();
      if (this.stageSent.length >= STAGE_PER_HOUR) return 'deferred';
    }

    const { subject, text } = this.render(kind, rt, ctx);
    // Testler (.env'deki gerçek posta ayarlarını da yükler) asla gerçek e-posta göndermez.
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      this.outbox.push({ kind, to: ctx.to, subject, text, inReplyTo: ctx.messageId });
      return 'sent';
    }
    const mailer = this.mailer(rt);
    if (!mailer) return 'skipped';
    await mailer.sendMail({
      from: { name: rt.fromName, address: rt.address },
      to: ctx.to,
      subject,
      text,
      messageId:
        ctx.replyMessageId ??
        `<${kind}-${randomUUID()}@${rt.address.split('@')[1] ?? 'ticket.local'}>`,
      inReplyTo: ctx.messageId,
      references: ctx.messageId,
      headers: { 'Auto-Submitted': 'auto-replied', Precedence: 'bulk' },
    });
    if (kind !== 'ack') this.stageSent.push(Date.now());
    this.logger.log(`Müşteriye "${kind}" yanıtı gönderildi: ${ctx.to} (${ctx.key})`);
    return 'sent';
  }

  /**
   * Süreç yanıtları: e-postadan açılan Bug için (1) Task'a çevrilip sprint'e girince ve kişiye atanınca "işleme
   * alındı", (2) Bug ya da çevrilen Task'lar tamamlanınca "çözüldü" bir kez gönderilir. Zaman damgası yazıldığı
   * için aynı yanıt iki kez gitmez; yanıt gönderilemezse bir sonraki turda yeniden denenir.
   */
  async sweep(workspaceId: string): Promise<number> {
    const since = new Date(Date.now() - SWEEP_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.inboundEmail.findMany({
      where: {
        workspaceId,
        kind: 'NEW',
        createdAt: { gte: since },
        OR: [{ processingMailAt: null }, { resolvedMailAt: null }],
        workItem: { deletedAt: null },
      },
      include: {
        rootCompany: { select: { name: true } },
        workItem: {
          select: {
            keyPrefix: true,
            number: true,
            status: { select: { category: true } },
            space: { select: { name: true, ticketInbox: true } },
            convertedTasks: {
              where: { deletedAt: null },
              select: {
                sprintId: true,
                status: { select: { category: true } },
                assignees: { select: { user: { select: { name: true } } }, take: 1 },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let sent = 0;
    for (const row of rows) {
      const bug = row.workItem;
      const tasks = bug.convertedTasks;
      const resolved =
        bug.status.category === 'DONE' ||
        (tasks.length > 0 && tasks.every((t) => t.status.category === 'DONE'));
      const working = tasks.find((t) => t.sprintId && t.assignees.length > 0);
      const ctx: ReplyContext = {
        workspaceId,
        to: row.fromEmail,
        name: row.fromName,
        key: formatItemKey(bug.keyPrefix, bug.number),
        subject: row.subject,
        messageId: row.messageId,
        company: row.rootCompany?.name,
        project: bug.space.ticketInbox ? undefined : bug.space.name,
        assignee: working?.assignees[0]?.user.name,
      };
      const stage: 'processing' | 'resolved' | null =
        resolved && !row.resolvedMailAt
          ? 'resolved'
          : !resolved && working && !row.processingMailAt
            ? 'processing'
            : null;
      if (!stage) continue;
      try {
        const outcome = await this.send(stage, ctx);
        if (outcome === 'deferred') continue;
        const now = new Date();
        await this.prisma.inboundEmail.update({
          where: { id: row.id },
          data:
            stage === 'resolved'
              ? { resolvedMailAt: now, processingMailAt: row.processingMailAt ?? now }
              : { processingMailAt: now },
        });
        if (outcome === 'sent') sent += 1;
      } catch (error) {
        this.logger.warn(
          `"${stage}" yanıtı gönderilemedi (${row.fromEmail}): ${(error as Error).message}`,
        );
      }
    }
    return sent;
  }
}
