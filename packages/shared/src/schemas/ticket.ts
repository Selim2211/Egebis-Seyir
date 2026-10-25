import { z } from 'zod';
import { TICKET_TEMPLATE_KEYS } from '../domain/ticket-templates';
import { BUG_SEVERITIES, BUG_STATUSES } from '../constants/work-item';

/** Alan adı: küçük harf, noktalarla ayrılmış etiketler (örn. alt.firma.com). */
export const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
export const DomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(DOMAIN_PATTERN, 'Geçerli bir alan adı girin (örn. firma.com)');

const Template = z.object({
  enabled: z.boolean(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(5000),
});
const Templates = z.object(
  Object.fromEntries(TICKET_TEMPLATE_KEYS.map((k) => [k, Template])) as Record<
    (typeof TICKET_TEMPLATE_KEYS)[number],
    typeof Template
  >,
);

const Host = z.string().trim().max(255).nullable();
const Port = z.int().min(1).max(65535);

/** E-posta ayarları (ADR-140): posta kutusu, şirket bilgisi, yanıt şablonları. Şifre dışarı verilmez. */
export const TicketSettingsSchema = z.object({
  imapHost: Host,
  imapPort: Port,
  imapSecure: z.boolean(),
  smtpHost: Host,
  smtpPort: Port,
  smtpSecure: z.boolean(),
  username: z.string().nullable(),
  /** SET: kayıtlı şifre var · EMPTY: yok. */
  passwordState: z.enum(['SET', 'EMPTY']),
  address: z.string().nullable(),
  fromName: z.string(),
  pollSeconds: z.int().min(15).max(3600),
  autoReply: z.boolean(),
  orgName: z.string().nullable(),
  orgPhone: z.string().nullable(),
  orgWebsite: z.string().nullable(),
  orgSignature: z.string().nullable(),
  templates: Templates,
  /** Yapay zeka (ADR-141): açık mı, hangi model, anahtar kayıtlı mı (anahtar dışarı verilmez). */
  aiEnabled: z.boolean(),
  aiModel: z.string(),
  aiKeyState: z.enum(['SET', 'EMPTY']),
  /** Kayıt yoksa .env değerleri kullanılır. */
  source: z.enum(['APP', 'ENV']),
});
export type TicketSettings = z.infer<typeof TicketSettingsSchema>;

/** PUT .../tickets/settings. `password`: undefined = değiştirme, boş metin = sil. */
export const UpdateTicketSettingsRequestSchema = z.object({
  imapHost: Host,
  imapPort: Port,
  imapSecure: z.boolean(),
  smtpHost: Host,
  smtpPort: Port,
  smtpSecure: z.boolean(),
  username: z.string().trim().max(255).nullable(),
  password: z.string().max(500).optional(),
  address: z.string().trim().toLowerCase().email().max(255).nullable(),
  fromName: z.string().trim().min(1).max(120),
  pollSeconds: z.int().min(15).max(3600),
  autoReply: z.boolean(),
  orgName: z.string().trim().max(200).nullable(),
  orgPhone: z.string().trim().max(60).nullable(),
  orgWebsite: z.string().trim().max(300).nullable(),
  orgSignature: z.string().trim().max(1000).nullable(),
  templates: Templates,
  /** undefined = değiştirme. */
  aiEnabled: z.boolean().optional(),
  aiModel: z.string().trim().min(1).max(200).optional(),
  /** undefined = değiştirme · boş metin = sil. */
  aiKey: z.string().max(500).optional(),
});
export type UpdateTicketSettingsRequest = z.infer<typeof UpdateTicketSettingsRequestSchema>;

/** POST .../tickets/settings/test — kayıtlı ayarla IMAP ve SMTP girişini dener. */
export const TicketConnectionTestSchema = z.object({
  imap: z.object({ ok: z.boolean(), detail: z.string().nullable() }),
  smtp: z.object({ ok: z.boolean(), detail: z.string().nullable() }),
});
export type TicketConnectionTest = z.infer<typeof TicketConnectionTestSchema>;

/** POST .../tickets/settings/ai-test — kayıtlı anahtar ve modelle küçük bir istek dener. */
export const TicketAiTestSchema = z.object({
  ok: z.boolean(),
  detail: z.string().nullable(),
  /** Başarılıysa modelin örnek cevabı. */
  sample: z.string().nullable(),
  ms: z.int().nullable(),
});
export type TicketAiTest = z.infer<typeof TicketAiTestSchema>;

// ---------- Firmalar ----------

export const TicketCompanySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable(),
  parentName: z.string().nullable(),
  defaultSpaceId: z.uuid().nullable(),
  defaultSpaceName: z.string().nullable(),
  notes: z.string().nullable(),
  domains: z.array(z.string()),
  /** Bu firmaya bağlı alt firma sayısı. */
  childCount: z.int(),
});
export type TicketCompany = z.infer<typeof TicketCompanySchema>;
export const TicketCompaniesResponseSchema = z.object({ companies: z.array(TicketCompanySchema) });
export type TicketCompaniesResponse = z.infer<typeof TicketCompaniesResponseSchema>;

const CompanyFields = {
  name: z.string().trim().min(1).max(200),
  parentId: z.uuid().nullable(),
  defaultSpaceId: z.uuid().nullable(),
  notes: z.string().trim().max(2000).nullable(),
  domains: z.array(DomainSchema).max(50),
};
/** POST|PUT .../tickets/companies */
export const SaveTicketCompanyRequestSchema = z.object(CompanyFields);
export type SaveTicketCompanyRequest = z.infer<typeof SaveTicketCompanyRequestSchema>;

// ---------- Yönlendirme kuralları ----------

export const TicketRuleSchema = z.object({
  id: z.uuid(),
  /** null = her firma. */
  companyId: z.uuid().nullable(),
  companyName: z.string().nullable(),
  keyword: z.string(),
  spaceId: z.uuid(),
  spaceName: z.string(),
  position: z.int(),
  enabled: z.boolean(),
});
export type TicketRule = z.infer<typeof TicketRuleSchema>;
export const TicketRulesResponseSchema = z.object({ rules: z.array(TicketRuleSchema) });
export type TicketRulesResponse = z.infer<typeof TicketRulesResponseSchema>;

/** POST|PUT .../tickets/rules — konu ya da metinde `keyword` geçerse Bug `spaceId` Projesine gider. */
export const SaveTicketRuleRequestSchema = z.object({
  companyId: z.uuid().nullable(),
  keyword: z.string().trim().min(2).max(100),
  spaceId: z.uuid(),
  enabled: z.boolean(),
});
export type SaveTicketRuleRequest = z.infer<typeof SaveTicketRuleRequestSchema>;

// ---------- Bug Kutusu ----------

export const BUG_BOX_PAGE_SIZE = 20;

export const BugBoxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(200).default(''),
  /** Tarihe göre: new = en yeni önce, old = en eski önce. */
  sort: z.enum(['new', 'old']).default('new'),
});
export type BugBoxQuery = z.infer<typeof BugBoxQuerySchema>;

export const BugBoxItemSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  space: z.object({
    id: z.uuid(),
    key: z.string(),
    name: z.string(),
    color: z.string(),
    inbox: z.boolean(),
  }),
  bugStatus: z.enum(BUG_STATUSES),
  severity: z.enum(BUG_SEVERITIES).nullable(),
  owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  assignee: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** E-postadan geldiyse gönderen ve firma. */
  email: z
    .object({
      fromName: z.string(),
      fromEmail: z.string(),
      company: z.string().nullable(),
      /** Eşleşen alan adı firması üst firmadan farklıysa (alt firma). */
      subCompany: z.string().nullable(),
      /** Otomatik atama günlüğü: hangi Projeye neden gitti. */
      routedTo: z.string().nullable(),
      routeReason: z.string().nullable(),
    })
    .nullable(),
  convertedTo: z.array(z.string()),
  createdAt: z.iso.datetime(),
});
export type BugBoxItem = z.infer<typeof BugBoxItemSchema>;

/** GET .../bug-box?page=&q=&sort= */
export const BugBoxResponseSchema = z.object({
  items: z.array(BugBoxItemSchema),
  total: z.int(),
  page: z.int(),
  pageSize: z.int(),
  pages: z.int(),
});
export type BugBoxResponse = z.infer<typeof BugBoxResponseSchema>;
