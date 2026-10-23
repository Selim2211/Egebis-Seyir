import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { Env } from '../../infra/config/env';
import { TicketsService } from './tickets.service';

/** Bu boyuttan büyük e-postalar (ek dahil) okunmaz; bellek ve süre sınırı. */
const MAX_MAIL_BYTES = 40 * 1024 * 1024;
/** Aynı e-posta bu kadar kez hata verirse okundu işaretlenip bırakılır (sonsuz yeniden deneme olmasın). */
const MAX_FAILURES = 3;

/**
 * Gelen kutusu yoklayıcısı (ADR-138): her dakika IMAP'ten okunmamış yeni e-postaları alır, `TicketsService`'e
 * verir ve başarılıysa okundu işaretler. TICKET_IMAP_HOST/USER/PASS boşsa hiç çalışmaz.
 */
@Injectable()
export class MailboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly failures = new Map<number, number>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly tickets: TicketsService,
  ) {}

  get enabled(): boolean {
    return Boolean(
      this.config.get('TICKET_IMAP_HOST', { infer: true }) &&
      this.config.get('TICKET_USER', { infer: true }) &&
      this.config.get('TICKET_PASS', { infer: true }) &&
      this.config.get('NODE_ENV', { infer: true }) !== 'test',
    );
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    const every = this.config.get('TICKET_POLL_SECONDS', { infer: true }) * 1000;
    this.logger.log(`Çağrı gelen kutusu açık (${every / 1000} sn'de bir yoklanır)`);
    setTimeout(() => void this.tick(), 5_000).unref();
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.pollOnce();
    } catch (error) {
      this.logger.warn(`Gelen kutusu yoklanamadı: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Bir tur: okunmamış, başlangıçtan yeni e-postaları işler. İşlenen sayıyı döner. */
  async pollOnce(): Promise<number> {
    const baseline = await this.tickets.baseline();
    const client = new ImapFlow({
      host: this.config.get('TICKET_IMAP_HOST', { infer: true })!,
      port: this.config.get('TICKET_IMAP_PORT', { infer: true }),
      secure: this.config.get('TICKET_IMAP_SECURE', { infer: true }),
      auth: {
        user: this.config.get('TICKET_USER', { infer: true }),
        pass: this.config.get('TICKET_PASS', { infer: true })!,
      },
      logger: false,
      socketTimeout: 60_000,
    });
    // Bağlantı hataları (ECONNRESET vb.) olay olarak gelir; yakalanmazsa süreç düşer.
    client.on('error', (error: Error) => this.logger.warn(`IMAP hatası: ${error.message}`));
    let handled = 0;
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = (await client.search({ seen: false, since: baseline }, { uid: true })) || [];
        for (const uid of uids) {
          if (await this.handle(client, uid, baseline)) handled += 1;
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return handled;
  }

  private async handle(client: ImapFlow, uid: number, baseline: Date): Promise<boolean> {
    const meta = await client.fetchOne(
      String(uid),
      { internalDate: true, size: true },
      { uid: true },
    );
    if (!meta) return false;
    const receivedAt = meta.internalDate instanceof Date ? meta.internalDate : new Date();
    // Başlangıçtan önceki (gün hassasiyetli aramada gelen) e-postalara dokunulmaz; okunmamış kalır.
    if (receivedAt < baseline) return false;
    const done = () => client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    if ((meta.size ?? 0) > MAX_MAIL_BYTES) {
      this.logger.warn(`E-posta çok büyük, atlandı (uid ${uid}, ${meta.size} bayt)`);
      await done();
      return false;
    }
    try {
      const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!full || !full.source) return false;
      const parsed = await simpleParser(full.source);
      const result = await this.tickets.ingest(parsed, full.source, receivedAt);
      await done();
      this.failures.delete(uid);
      return result === 'created' || result === 'reply';
    } catch (error) {
      const count = (this.failures.get(uid) ?? 0) + 1;
      this.failures.set(uid, count);
      this.logger.error(
        `E-posta işlenemedi (uid ${uid}, deneme ${count}): ${(error as Error).message}`,
      );
      if (count >= MAX_FAILURES) await done();
      return false;
    }
  }
}
