import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { Env } from '../../infra/config/env';
import { TicketsService } from './tickets.service';

/** Bu boyuttan büyük e-postalar (ek dahil) okunmaz; bellek ve süre sınırı. */
const MAX_MAIL_BYTES = 40 * 1024 * 1024;
/** Aynı e-posta bu kadar kez hata verirse atlanır (sonsuz yeniden deneme olmasın). */
const MAX_FAILURES = 3;

/**
 * Gelen kutusu yoklayıcısı (ADR-138): her turda IMAP'ten imleçten (UID) sonra gelen e-postaları alır ve
 * `TicketsService`'e verir. Okundu bayrağına dokunmaz: kendi gönderdiğiniz ya da webmail'de açılmış e-posta da
 * işlenir, kutunun durumu bozulmaz. İlk açılışta imleç kutudaki son UID'ye konur (eski e-postalar içe alınmaz).
 * TICKET_IMAP_HOST/USER/PASS boşsa hiç çalışmaz.
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

  /** Bir tur: imleçten sonraki e-postaları işler. Bug olan ya da yanıt olarak eklenen sayıyı döner. */
  async pollOnce(): Promise<number> {
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
        const box = client.mailbox;
        if (!box) return 0;
        const validity = box.uidValidity;
        const last = box.uidNext - 1;
        const cursor = await this.tickets.cursor();
        if (cursor.uid === null || cursor.validity !== validity) {
          // İlk açılış (ya da kutu yeniden kuruldu): şimdiye kadarki e-postalar içe alınmaz.
          await this.tickets.saveCursor(last, validity);
          this.logger.log(`Çağrı gelen kutusu imleci UID ${last}'e konuldu (öncesi içe alınmaz)`);
          return 0;
        }
        if (last <= cursor.uid) return 0;
        const found = (await client.search({ uid: `${cursor.uid + 1}:*` }, { uid: true })) || [];
        const uids = found.filter((uid) => uid > cursor.uid!).sort((a, b) => a - b);
        for (const uid of uids) {
          const ok = await this.handle(client, uid);
          if (ok === 'retry') break; // sıra korunur; sonraki turda aynı e-posta yeniden denenir
          await this.tickets.saveCursor(uid, validity);
          if (ok === 'done') handled += 1;
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return handled;
  }

  /** done: Bug/yorum oldu · skip: atlandı (imleç ilerler) · retry: hata, tekrar denenecek. */
  private async handle(client: ImapFlow, uid: number): Promise<'done' | 'skip' | 'retry'> {
    try {
      const meta = await client.fetchOne(
        String(uid),
        { internalDate: true, size: true },
        { uid: true },
      );
      if (!meta) return 'skip';
      if ((meta.size ?? 0) > MAX_MAIL_BYTES) {
        this.logger.warn(`E-posta çok büyük, atlandı (uid ${uid}, ${meta.size} bayt)`);
        return 'skip';
      }
      const receivedAt = meta.internalDate instanceof Date ? meta.internalDate : new Date();
      const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!full || !full.source) return 'skip';
      const parsed = await simpleParser(full.source);
      const result = await this.tickets.ingest(parsed, full.source, receivedAt);
      this.failures.delete(uid);
      return result === 'created' || result === 'reply' ? 'done' : 'skip';
    } catch (error) {
      const count = (this.failures.get(uid) ?? 0) + 1;
      this.failures.set(uid, count);
      this.logger.error(
        `E-posta işlenemedi (uid ${uid}, deneme ${count}): ${(error as Error).message}`,
      );
      return count >= MAX_FAILURES ? 'skip' : 'retry';
    }
  }
}
