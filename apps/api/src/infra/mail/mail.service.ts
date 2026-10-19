import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { QueueService } from '../queue/queue.service';
import { MailSettingsService, type SmtpConfig } from './mail-settings.service';
import type { MailMessage } from './templates';

const MAIL_JOB = 'mail.send';

export interface MailTestOutcome {
  ok: boolean;
  server: string | null;
  code: string | null;
  detail: string | null;
}

/** E-posta gönderimi (ADR-021). Gönderim kuyruk üzerinden yapılır; hata olursa tekrar denenir. */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter?: { key: string; value: Transporter };
  /** MAIL_TRANSPORT=memory iken gönderilen e-postalar (yalnızca testler). */
  readonly outbox: MailMessage[] = [];

  constructor(
    private readonly settings: MailSettingsService,
    private readonly queue: QueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.register<MailMessage>(MAIL_JOB, (message) => this.deliver(message));
  }

  /** E-postayı gönderim kuyruğuna ekler. */
  async send(message: MailMessage): Promise<void> {
    await this.queue.enqueue(MAIL_JOB, message);
  }

  /**
   * Yöneticinin "Test e-postası gönder" düğmesi: kuyruğu atlayıp doğrudan gönderir ve hatayı
   * (EAUTH, ETIMEDOUT…) çağırana döndürür; kuyruktaki gönderimler hatayı yalnızca günlüğe yazar.
   */
  async sendTest(message: MailMessage): Promise<MailTestOutcome> {
    const cfg = await this.settings.effective();
    if (!cfg) {
      this.outbox.push(message);
      return { ok: true, server: null, code: null, detail: null };
    }
    const server = `${cfg.host}:${cfg.port}`;
    if (cfg.passwordState === 'EMPTY') {
      return { ok: false, server, code: 'SMTP_PASS_EMPTY', detail: null };
    }
    if (cfg.passwordState === 'UNREADABLE') {
      return { ok: false, server, code: 'SMTP_PASS_UNREADABLE', detail: null };
    }
    try {
      await this.transport(cfg).sendMail(this.envelope(cfg, message));
      this.logger.log(`Test e-postası gönderildi: ${message.to}`);
      return { ok: true, server, code: null, detail: null };
    } catch (err) {
      const e = err as { code?: string; response?: string; message?: string };
      this.logger.warn(`Test e-postası gönderilemedi (${e.code ?? 'bilinmiyor'}): ${e.message}`);
      return {
        ok: false,
        server,
        code: e.code ?? 'UNKNOWN',
        detail: (e.response ?? e.message ?? '').slice(0, 400) || null,
      };
    }
  }

  private async deliver(message: MailMessage): Promise<void> {
    const cfg = await this.settings.effective();
    if (!cfg) {
      this.outbox.push(message);
      return;
    }
    await this.transport(cfg).sendMail(this.envelope(cfg, message));
    this.logger.log(`E-posta gönderildi: ${message.subject}`);
  }

  /** Otomatik, işlemsel e-posta: yanıt otomatiği ve spam filtreleri için işaretlenir. */
  private envelope(cfg: SmtpConfig, message: MailMessage) {
    return {
      from: cfg.from,
      ...message,
      headers: { 'Auto-Submitted': 'auto-generated', ...message.headers },
    };
  }

  /** Ayar değişince (anahtar farklı) yeni taşıyıcı kurulur; aynıysa bağlantı yeniden kullanılır. */
  private transport(cfg: SmtpConfig): Transporter {
    const key = JSON.stringify([cfg.host, cfg.port, cfg.secure, cfg.user, cfg.pass]);
    if (this.transporter?.key !== key) {
      this.transporter?.value.close();
      this.transporter = {
        key,
        value: createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? undefined } : undefined,
          // Test düğmesi dakikalarca asılı kalmasın (engelli port sessizce zaman aşımına uğrar).
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 15_000,
        }),
      };
    }
    return this.transporter.value;
  }
}
