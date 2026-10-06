import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import { QueueService } from '../queue/queue.service';
import type { MailMessage } from './templates';

const MAIL_JOB = 'mail.send';

/** E-posta gönderimi (ADR-021). Gönderim kuyruk üzerinden yapılır; hata olursa tekrar denenir. */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  private readonly from: string;
  /** MAIL_TRANSPORT=memory iken gönderilen e-postalar (yalnızca testler). */
  readonly outbox: MailMessage[] = [];

  constructor(
    config: ConfigService<Env, true>,
    private readonly queue: QueueService,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
    if (config.get('MAIL_TRANSPORT', { infer: true }) === 'smtp') {
      const user = config.get('SMTP_USER', { infer: true });
      this.transporter = createTransport({
        host: config.get('SMTP_HOST', { infer: true }),
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_SECURE', { infer: true }),
        auth: user ? { user, pass: config.get('SMTP_PASS', { infer: true }) } : undefined,
      });
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
