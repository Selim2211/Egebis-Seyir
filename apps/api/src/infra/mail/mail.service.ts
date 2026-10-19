import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import { QueueService } from '../queue/queue.service';
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
  private readonly transporter?: Transporter;
  private readonly from: string;
  private readonly server: string | null = null;
  /** SMTP_USER verilmiş ama SMTP_PASS boş: sunucuya gitmeden anlaşılır hata ver. */
  private readonly passwordMissing: boolean = false;
  /** MAIL_TRANSPORT=memory iken gönderilen e-postalar (yalnızca testler). */
  readonly outbox: MailMessage[] = [];

  constructor(
    config: ConfigService<Env, true>,
    private readonly queue: QueueService,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
    if (config.get('MAIL_TRANSPORT', { infer: true }) === 'smtp') {
      const host = config.get('SMTP_HOST', { infer: true });
      const port = config.get('SMTP_PORT', { infer: true });
      const user = config.get('SMTP_USER', { infer: true });
      this.server = `${host}:${port}`;
      this.passwordMissing = Boolean(user) && !config.get('SMTP_PASS', { infer: true });
      this.transporter = createTransport({
        host,
        port,
        secure: config.get('SMTP_SECURE', { infer: true }),
        auth: user ? { user, pass: config.get('SMTP_PASS', { infer: true }) } : undefined,
        // Test düğmesi dakikalarca asılı kalmasın (engelli port sessizce zaman aşımına uğrar).
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }
  }

  /**
   * Yöneticinin "Test e-postası gönder" düğmesi: kuyruğu atlayıp doğrudan gönderir ve hatayı
   * (EAUTH, ETIMEDOUT…) çağırana döndürür; kuyruktaki gönderimler hatayı yalnızca günlüğe yazar.
   */
  async sendTest(message: MailMessage): Promise<MailTestOutcome> {
    if (!this.transporter) {
      this.outbox.push(message);
      return { ok: true, server: null, code: null, detail: null };
    }
    if (this.passwordMissing) {
      return { ok: false, server: this.server, code: 'SMTP_PASS_EMPTY', detail: null };
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        ...message,
        headers: { 'Auto-Submitted': 'auto-generated', ...message.headers },
      });
      this.logger.log(`Test e-postası gönderildi: ${message.to}`);
      return { ok: true, server: this.server, code: null, detail: null };
    } catch (err) {
      const e = err as { code?: string; response?: string; message?: string };
      this.logger.warn(`Test e-postası gönderilemedi (${e.code ?? 'bilinmiyor'}): ${e.message}`);
      return {
        ok: false,
        server: this.server,
        code: e.code ?? 'UNKNOWN',
        detail: (e.response ?? e.message ?? '').slice(0, 400) || null,
      };
    }
  }

  async onModuleInit(): Promise<void> {
    await this.queue.register<MailMessage>(MAIL_JOB, (message) => this.deliver(message));
  }

  /** E-postayı gönderim kuyruğuna ekler. */
  async send(message: MailMessage): Promise<void> {
    await this.queue.enqueue(MAIL_JOB, message);
  }

  private async deliver(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.outbox.push(message);
      return;
    }
    // Otomatik, işlemsel e-posta: yanıt otomatiği ve spam filtreleri için işaretlenir.
    await this.transporter.sendMail({
      from: this.from,
      ...message,
      headers: { 'Auto-Submitted': 'auto-generated', ...message.headers },
    });
    this.logger.log(`E-posta gönderildi: ${message.subject}`);
  }
}
