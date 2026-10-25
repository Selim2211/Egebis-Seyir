import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_TICKET_TEMPLATES,
  TICKET_TEMPLATE_KEYS,
  type TicketConnectionTest,
  type TicketSettings,
  type TicketTemplate,
  type TicketTemplateKey,
  type UpdateTicketSettingsRequest,
} from '@scrum/shared';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import type { Env } from '../../infra/config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SecretBoxService } from '../../infra/security/secret-box.service';
import { asJson } from '../work-items/item-support';

/** Çalışma anında kullanılan çağrı sistemi ayarı (kayıtlı ayar, yoksa .env). */
export interface TicketRuntime {
  imap: { host: string; port: number; secure: boolean } | null;
  smtp: { host: string; port: number; secure: boolean } | null;
  user: string | null;
  pass: string | null;
  address: string;
  fromName: string;
  pollSeconds: number;
  autoReply: boolean;
  org: { name: string; phone: string; website: string; signature: string };
  templates: Record<TicketTemplateKey, TicketTemplate>;
  /** Yapay zeka (ADR-141). Anahtar kayıtlı değilse `.env` anahtarı kullanılır. */
  ai: { enabled: boolean; model: string; key: string | null; url: string };
  source: 'APP' | 'ENV';
}

/** Kayıtlı şablonları varsayılanlarla birleştirir (eksik anahtar varsayılanı kullanır). */
export function mergeTemplates(stored: unknown): Record<TicketTemplateKey, TicketTemplate> {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<
    string,
    Partial<TicketTemplate>
  >;
  return Object.fromEntries(
    TICKET_TEMPLATE_KEYS.map((key) => {
      const d = DEFAULT_TICKET_TEMPLATES[key];
      const s = raw[key] ?? {};
      return [
        key,
        {
          enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
          subject: typeof s.subject === 'string' && s.subject.trim() ? s.subject : d.subject,
          body: typeof s.body === 'string' && s.body.trim() ? s.body : d.body,
        },
      ];
    }),
  ) as Record<TicketTemplateKey, TicketTemplate>;
}

/**
 * Çağrı sistemi ayarlarının tek kaynağı (ADR-140). Ayarlar ekranından kaydedilen değer (`ticket_settings`,
 * şifre şifreli) varsa o, yoksa `.env` (TICKET_*) kullanılır. Böylece canlıda sunucuya dokunmadan değişir.
 */
@Injectable()
export class TicketConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly box: SecretBoxService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async effective(workspaceId: string): Promise<TicketRuntime> {
    const row = await this.prisma.ticketSettings.findUnique({ where: { workspaceId } });
    if (row) {
      const pass = row.passwordEnc ? await this.box.open(row.passwordEnc) : null;
      const imapHost = row.imapHost?.trim() || null;
      const smtpHost = row.smtpHost?.trim() || imapHost;
      const address = (row.address ?? row.username ?? '').toLowerCase();
      return {
        imap: imapHost ? { host: imapHost, port: row.imapPort, secure: row.imapSecure } : null,
        smtp: smtpHost ? { host: smtpHost, port: row.smtpPort, secure: row.smtpSecure } : null,
        user: row.username,
        pass,
        address,
        fromName: row.fromName,
        pollSeconds: row.pollSeconds,
        autoReply: row.autoReply,
        org: this.org(row.orgName, row.orgPhone, row.orgWebsite, row.orgSignature, row.fromName),
        templates: mergeTemplates(row.templates),
        ai: {
          enabled: row.aiEnabled,
          model: row.aiModel,
          key: row.aiKeyEnc ? await this.box.open(row.aiKeyEnc) : this.envAiKey(),
          url: this.config.get('TICKET_AI_URL', { infer: true }),
        },
        source: 'APP',
      };
    }
    const imapHost = this.config.get('TICKET_IMAP_HOST', { infer: true }) ?? null;
    const smtpHost = this.config.get('TICKET_SMTP_HOST', { infer: true }) ?? imapHost;
    const user = this.config.get('TICKET_USER', { infer: true }) ?? null;
    const fromName = this.config.get('TICKET_FROM_NAME', { infer: true });
    return {
      imap: imapHost
        ? {
            host: imapHost,
            port: this.config.get('TICKET_IMAP_PORT', { infer: true }),
            secure: this.config.get('TICKET_IMAP_SECURE', { infer: true }),
          }
        : null,
      smtp: smtpHost
        ? {
            host: smtpHost,
            port: this.config.get('TICKET_SMTP_PORT', { infer: true }),
            secure: this.config.get('TICKET_SMTP_SECURE', { infer: true }),
          }
        : null,
      user,
      pass: this.config.get('TICKET_PASS', { infer: true }) ?? null,
      address: (this.config.get('TICKET_ADDRESS', { infer: true }) ?? user ?? '').toLowerCase(),
      fromName,
      pollSeconds: this.config.get('TICKET_POLL_SECONDS', { infer: true }),
      autoReply: this.config.get('TICKET_AUTO_REPLY', { infer: true }),
      org: this.org(null, null, null, null, fromName),
      templates: mergeTemplates({}),
      ai: {
        enabled: this.config.get('TICKET_AI_ENABLED', { infer: true }),
        model: this.config.get('TICKET_AI_MODEL', { infer: true }),
        key: this.envAiKey(),
        url: this.config.get('TICKET_AI_URL', { infer: true }),
      },
      source: 'ENV',
    };
  }

  private envAiKey(): string | null {
    return this.config.get('TICKET_AI_KEY', { infer: true }) ?? null;
  }

  private org(
    name: string | null,
    phone: string | null,
    website: string | null,
    signature: string | null,
    fallbackName: string,
  ) {
    const orgName = name?.trim() || fallbackName;
    const sign =
      signature?.trim() || [orgName, phone?.trim(), website?.trim()].filter(Boolean).join('\n');
    return {
      name: orgName,
      phone: phone?.trim() ?? '',
      website: website?.trim() ?? '',
      signature: sign,
    };
  }

  /** Arayüze dönen görünüm: şifre yok, yalnızca kayıtlı olup olmadığı. */
  async view(workspaceId: string): Promise<TicketSettings> {
    const row = await this.prisma.ticketSettings.findUnique({ where: { workspaceId } });
    if (row) {
      return {
        imapHost: row.imapHost,
        imapPort: row.imapPort,
        imapSecure: row.imapSecure,
        smtpHost: row.smtpHost,
        smtpPort: row.smtpPort,
        smtpSecure: row.smtpSecure,
        username: row.username,
        passwordState: row.passwordEnc ? 'SET' : 'EMPTY',
        address: row.address,
        fromName: row.fromName,
        pollSeconds: row.pollSeconds,
        autoReply: row.autoReply,
        orgName: row.orgName,
        orgPhone: row.orgPhone,
        orgWebsite: row.orgWebsite,
        orgSignature: row.orgSignature,
        templates: mergeTemplates(row.templates),
        aiEnabled: row.aiEnabled,
        aiModel: row.aiModel,
        aiKeyState: row.aiKeyEnc || this.envAiKey() ? 'SET' : 'EMPTY',
        source: 'APP',
      };
    }
    const rt = await this.effective(workspaceId);
    return {
      imapHost: rt.imap?.host ?? null,
      imapPort: rt.imap?.port ?? 993,
      imapSecure: rt.imap?.secure ?? true,
      smtpHost: rt.smtp?.host ?? null,
      smtpPort: rt.smtp?.port ?? 465,
      smtpSecure: rt.smtp?.secure ?? true,
      username: rt.user,
      passwordState: rt.pass ? 'SET' : 'EMPTY',
      address: rt.address || null,
      fromName: rt.fromName,
      pollSeconds: rt.pollSeconds,
      autoReply: rt.autoReply,
      orgName: null,
      orgPhone: null,
      orgWebsite: null,
      orgSignature: null,
      templates: rt.templates,
      aiEnabled: rt.ai.enabled,
      aiModel: rt.ai.model,
      aiKeyState: rt.ai.key ? 'SET' : 'EMPTY',
      source: 'ENV',
    };
  }

  async update(workspaceId: string, input: UpdateTicketSettingsRequest): Promise<void> {
    const existing = await this.prisma.ticketSettings.findUnique({ where: { workspaceId } });
    // undefined: değiştirme · boş metin: sil · değer: şifrele. İlk kayıtta .env şifresi devralınır.
    let passwordEnc = existing?.passwordEnc ?? null;
    if (input.password === undefined && !existing) {
      const envPass = this.config.get('TICKET_PASS', { infer: true });
      passwordEnc = envPass ? await this.box.seal(envPass) : null;
    } else if (input.password === '') passwordEnc = null;
    else if (input.password !== undefined) passwordEnc = await this.box.seal(input.password);
    // Yapay zeka anahtarı da aynı kural: undefined = değiştirme, boş = sil, değer = şifrele.
    let aiKeyEnc = existing?.aiKeyEnc ?? null;
    if (input.aiKey === '') aiKeyEnc = null;
    else if (input.aiKey !== undefined) aiKeyEnc = await this.box.seal(input.aiKey);
    const { password: _password, aiKey: _aiKey, templates, aiEnabled, aiModel, ...rest } = input;
    void _password;
    void _aiKey;
    const data = {
      ...rest,
      passwordEnc,
      aiKeyEnc,
      ...(aiEnabled === undefined ? {} : { aiEnabled }),
      ...(aiModel === undefined ? {} : { aiModel }),
      templates: asJson(templates),
    };
    await this.prisma.ticketSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data },
      update: data,
    });
  }

  /** Kayıtlı (etkin) ayarla IMAP ve SMTP girişini dener; hata metni kısa tutulur. */
  async test(workspaceId: string): Promise<TicketConnectionTest> {
    const rt = await this.effective(workspaceId);
    const short = (e: unknown) =>
      String(
        (e as { responseText?: string; message?: string }).responseText ??
          (e as Error).message ??
          e,
      ).slice(0, 200);
    const imap = await (async () => {
      if (!rt.imap || !rt.user || !rt.pass)
        return { ok: false, detail: 'IMAP sunucusu, kullanıcı adı ya da şifre eksik' };
      const client = new ImapFlow({
        host: rt.imap.host,
        port: rt.imap.port,
        secure: rt.imap.secure,
        auth: { user: rt.user, pass: rt.pass },
        logger: false,
        socketTimeout: 15_000,
      });
      client.on('error', () => undefined);
      try {
        await client.connect();
        await client.logout();
        return { ok: true, detail: null };
      } catch (e) {
        return { ok: false, detail: short(e) };
      }
    })();
    const smtp = await (async () => {
      if (!rt.smtp || !rt.user || !rt.pass)
        return { ok: false, detail: 'SMTP sunucusu, kullanıcı adı ya da şifre eksik' };
      try {
        await createTransport({
          host: rt.smtp.host,
          port: rt.smtp.port,
          secure: rt.smtp.secure,
          auth: { user: rt.user, pass: rt.pass },
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 15_000,
        }).verify();
        return { ok: true, detail: null };
      } catch (e) {
        return { ok: false, detail: short(e) };
      }
    })();
    return { imap, smtp };
  }
}
