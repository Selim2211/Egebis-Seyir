import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailSettings, UpdateMailSettingsRequest } from '@scrum/shared';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SecretBoxService } from '../security/secret-box.service';

/** Gönderimde kullanılan SMTP bilgisi; `passwordState` boşluk/okunamama nedenini taşır. */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
  source: 'APP' | 'ENV';
  passwordState: 'OK' | 'EMPTY' | 'UNREADABLE';
}

/**
 * SMTP ayarının tek kaynağı (ADR-120). Uygulamada kaydedilmiş ayar (`mail_settings`) varsa o,
 * yoksa sunucu `.env` değerleri kullanılır. `MAIL_TRANSPORT=memory` (testler) her zaman önce gelir.
 */
@Injectable()
export class MailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly box: SecretBoxService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get memory(): boolean {
    return this.config.get('MAIL_TRANSPORT', { infer: true }) === 'memory';
  }

  /** Gönderimde kullanılacak ayar; test belleği modunda `null`. */
  async effective(): Promise<SmtpConfig | null> {
    return this.memory ? null : this.resolve();
  }

  /** Kayıtlı uygulama ayarı, yoksa sunucu .env değerleri (bellek modundan bağımsız). */
  private async resolve(): Promise<SmtpConfig> {
    const row = await this.row();
    if (row) {
      const pass = row.passwordEnc ? await this.box.open(row.passwordEnc) : null;
      const needsPass = Boolean(row.username);
      return {
        host: row.host,
        port: row.port,
        secure: row.secure,
        user: row.username,
        pass,
        from: row.fromAddress,
        source: 'APP',
        passwordState: !needsPass || pass ? 'OK' : row.passwordEnc ? 'UNREADABLE' : 'EMPTY',
      };
    }
    const user = this.config.get('SMTP_USER', { infer: true }) ?? null;
    const pass = this.config.get('SMTP_PASS', { infer: true }) ?? null;
    return {
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      user,
      pass,
      from: this.config.get('MAIL_FROM', { infer: true }),
      source: 'ENV',
      passwordState: user && !pass ? 'EMPTY' : 'OK',
    };
  }

  /** Arayüze dönen görünüm: şifre yok, yalnızca kayıtlı olup olmadığı. */
  async view(): Promise<MailSettings> {
    const stored = await this.row();
    if (this.memory && !stored) {
      return {
        host: 'memory',
        port: 0,
        secure: false,
        username: null,
        passwordSet: false,
        from: this.config.get('MAIL_FROM', { infer: true }),
        source: 'MEMORY',
      };
    }
    const cfg = await this.resolve();
    return {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      username: cfg.user,
      passwordSet: cfg.passwordState !== 'EMPTY',
      from: cfg.from,
      source: cfg.source,
    };
  }

  async save(input: UpdateMailSettingsRequest, actorId: string): Promise<void> {
    const current = await this.row();
    // Google uygulama şifresi 4'erli gruplar halinde gösterilir; boşluklar şifrenin parçası değildir.
    const isGoogle = /(^|\.)(gmail|googlemail)\.com$/i.test(input.host);
    const password = isGoogle ? input.password?.replace(/\s+/g, '') : input.password;
    const passwordEnc =
      password === undefined
        ? (current?.passwordEnc ?? null)
        : password === ''
          ? null
          : await this.box.seal(password);
    const username = input.username?.trim() ? input.username.trim() : null;
    const data = {
      host: input.host,
      port: input.port,
      secure: input.secure,
      username,
      // Kullanıcı adı yoksa (kimlik doğrulamasız sunucu) eski şifre anlamsızdır.
      passwordEnc: username ? passwordEnc : null,
      fromAddress: input.from,
      updatedById: actorId,
    };
    await this.prisma.mailSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
  }

  /** Kaydedilmiş uygulama ayarını siler; `.env` değerlerine dönülür. */
  async reset(): Promise<void> {
    await this.prisma.mailSettings.deleteMany({ where: { id: 1 } });
  }

  /** Gönderim başına tek anahtar sorgusu; önbellek yok, ayar değişince hemen geçerli olur. */
  private row() {
    return this.prisma.mailSettings.findUnique({ where: { id: 1 } });
  }
}
