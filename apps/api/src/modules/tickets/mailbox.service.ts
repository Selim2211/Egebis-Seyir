import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { Env } from '../../infra/config/env';
import { TicketConfigService, type TicketRuntime } from './ticket-config.service';
import { TicketRepliesService } from './ticket-replies.service';
import { type IngestResult, TicketsService } from './tickets.service';

/** Bu boyuttan büyük e-postalar (ek dahil) okunmaz; bellek ve süre sınırı. */
const MAX_MAIL_BYTES = 40 * 1024 * 1024;
/** Aynı e-posta bu kadar kez hata verirse atlanır (sonsuz yeniden deneme olmasın). */
const MAX_FAILURES = 3;
/** Zamanlayıcı bu aralıkla uyanır; asıl yoklama sıklığı ayardaki `pollSeconds`'tır. */
const TICK_MS = 10_000;

type Box = 'inbox' | 'sent';

/**
 * Gelen kutusu yoklayıcısı (ADR-138, ADR-140): ayarlar ekranındaki (yoksa .env) posta kutusunu izler. Her turda iki
 * klasörü UID imleciyle okur ve ardından süreç yanıtlarını (işleme alındı, çözüldü) gönderir.
 * - INBOX: müşteri e-postaları (yeni çağrı ya da yanıt).
 * - Gönderilmiş Öğeler: bizim bir çağrıya verdiğimiz yanıtlar (Outlook/webmail'den); yazışmaya "Destek yanıtı" düşer.
 * Okundu bayrağına dokunmaz. İlk açılışta imleç klasördeki son UID'ye konur (eski e-postalar içe alınmaz).
 * Ayarlar değişince yeniden başlatma gerekmez.
 */
@Injectable()
export class MailboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastPoll = 0;
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly tickets: TicketsService,
    private readonly cfg: TicketConfigService,
    private readonly replies: TicketRepliesService,
  ) {}

  onModuleInit(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    setTimeout(() => void this.tick(), 5_000).unref();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Kutu bilgisi (sunucu, kullanıcı, şifre) tam mı? */
  static configured(rt: TicketRuntime): boolean {
    return Boolean(rt.imap && rt.user && rt.pass);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const target = await this.tickets.target();
      if (!target) return;
      const rt = await this.cfg.effective(target.workspaceId);
      if (Date.now() - this.lastPoll < rt.pollSeconds * 1000) return;
      this.lastPoll = Date.now();
      if (MailboxService.configured(rt)) await this.pollOnce(rt);
      await this.replies.sweep(target.workspaceId);
    } catch (error) {
      this.logger.warn(`Gelen kutusu yoklanamadı: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Bir tur: gelen ve gönderilmiş klasörlerde imleçten sonraki e-postaları işler. Yazışmaya eklenen sayıyı döner. */
  async pollOnce(rt: TicketRuntime): Promise<number> {
    if (!rt.imap || !rt.user || !rt.pass) return 0;
    const client = new ImapFlow({
      host: rt.imap.host,
      port: rt.imap.port,
      secure: rt.imap.secure,
      auth: { user: rt.user, pass: rt.pass },
      logger: false,
      socketTimeout: 60_000,
    });
    // Bağlantı hataları (ECONNRESET vb.) olay olarak gelir; yakalanmazsa süreç düşer.
    client.on('error', (error: Error) => this.logger.warn(`IMAP hatası: ${error.message}`));
    let handled = 0;
    await client.connect();
    try {
      handled += await this.pollFolder(client, 'INBOX', 'inbox', (m, raw, at) =>
        this.tickets.ingest(m, raw, at),
      );
      const sent = (await client.list()).find(
        (b) => b.specialUse === '\\Sent' || /^(sent|gönderilmiş)/i.test(b.name),
      );
      if (sent) {
        handled += await this.pollFolder(client, sent.path, 'sent', (m, raw, at) =>
          this.tickets.ingestSent(m, raw, at),
        );
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return handled;
  }

  private async pollFolder(
    client: ImapFlow,
    path: string,
    box: Box,
    ingest: (mail: ParsedMail, raw: Buffer, at: Date) => Promise<IngestResult>,
  ): Promise<number> {
    let handled = 0;
    const lock = await client.getMailboxLock(path);
    try {
      const mailbox = client.mailbox;
      if (!mailbox) return 0;
      const validity = mailbox.uidValidity;
      const last = mailbox.uidNext - 1;
      const cursor = await this.tickets.cursor(box);
      if (cursor.uid === null || cursor.validity !== validity) {
        // İlk açılış (ya da klasör yeniden kuruldu): şimdiye kadarki e-postalar içe alınmaz.
        await this.tickets.saveCursor(box, last, validity);
        this.logger.log(`${path} imleci UID ${last}'e konuldu (öncesi içe alınmaz)`);
        return 0;
      }
      if (last <= cursor.uid) return 0;
      const found = (await client.search({ uid: `${cursor.uid + 1}:*` }, { uid: true })) || [];
      const uids = found.filter((uid) => uid > cursor.uid!).sort((a, b) => a - b);
      for (const uid of uids) {
        const outcome = await this.handle(client, box, uid, ingest);
        if (outcome === 'retry') break; // sıra korunur; sonraki turda aynı e-posta yeniden denenir
        await this.tickets.saveCursor(box, uid, validity);
        if (outcome === 'done') handled += 1;
      }
    } finally {
      lock.release();
    }
    return handled;
  }

  /** done: Bug/yorum oldu · skip: atlandı (imleç ilerler) · retry: hata, tekrar denenecek. */
  private async handle(
    client: ImapFlow,
    box: Box,
    uid: number,
    ingest: (mail: ParsedMail, raw: Buffer, at: Date) => Promise<IngestResult>,
  ): Promise<'done' | 'skip' | 'retry'> {
    const key = `${box}:${uid}`;
    try {
      const meta = await client.fetchOne(
        String(uid),
        { internalDate: true, size: true },
        { uid: true },
      );
      if (!meta) return 'skip';
      if ((meta.size ?? 0) > MAX_MAIL_BYTES) {
        this.logger.warn(`E-posta çok büyük, atlandı (${key}, ${meta.size} bayt)`);
        return 'skip';
      }
      const receivedAt = meta.internalDate instanceof Date ? meta.internalDate : new Date();
      const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!full || !full.source) return 'skip';
      const parsed = await simpleParser(full.source);
      const result = await ingest(parsed, full.source, receivedAt);
      this.failures.delete(key);
      return result === 'created' || result === 'reply' ? 'done' : 'skip';
    } catch (error) {
      const count = (this.failures.get(key) ?? 0) + 1;
      this.failures.set(key, count);
      this.logger.error(
        `E-posta işlenemedi (${key}, deneme ${count}): ${(error as Error).message}`,
      );
      return count >= MAX_FAILURES ? 'skip' : 'retry';
    }
  }
}
