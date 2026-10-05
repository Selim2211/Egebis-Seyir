import { z } from 'zod';
import { ERROR_CODES } from '../errors/codes';
import { WORKSPACE_ROLES } from '../permissions/roles';
import { EmailSchema, LOCALES, PasswordSchema, PersonNameSchema } from './auth';

export const MemberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  title: z.string().nullable(),
  avatarVersion: z.string().nullable(),
  role: z.enum(WORKSPACE_ROLES),
  joinedAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime().nullable(),
});
export type Member = z.infer<typeof MemberSchema>;

/** GET /api/workspaces/:workspaceId/members */
export const MembersResponseSchema = z.object({ members: z.array(MemberSchema) });
export type MembersResponse = z.infer<typeof MembersResponseSchema>;

/** PATCH /api/workspaces/:workspaceId/members/:userId */
export const UpdateMemberRequestSchema = z.object({ role: z.enum(WORKSPACE_ROLES) });
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequestSchema>;

export const InvitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(WORKSPACE_ROLES),
  invitedBy: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof InvitationSchema>;

/** GET /api/workspaces/:workspaceId/invitations — yalnızca bekleyen davetler. */
export const InvitationsResponseSchema = z.object({ invitations: z.array(InvitationSchema) });
export type InvitationsResponse = z.infer<typeof InvitationsResponseSchema>;

/**
 * POST /api/workspaces/:workspaceId/invitations
 * Guest daveti en az bir Space ile yapılır; Guest bu Space'lere Stakeholder olarak eklenir (ADR-043).
 */
export const CreateInvitationsRequestSchema = z
  .object({
    emails: z.array(EmailSchema).min(1).max(20),
    role: z.enum(WORKSPACE_ROLES).exclude(['OWNER']),
    spaceIds: z.array(z.uuid()).max(50).default([]),
  })
  .refine((v) => v.role !== 'GUEST' || v.spaceIds.length > 0, {
    path: ['spaceIds'],
    message: ERROR_CODES.GUEST_SPACES_REQUIRED,
  });
export type CreateInvitationsRequest = z.input<typeof CreateInvitationsRequestSchema>;

/** GET /api/invitations/:token — kabul ekranı için özet. */
export const InvitationPreviewSchema = z.object({
  workspaceName: z.string(),
  invitedBy: z.string(),
  email: z.string(),
  role: z.enum(WORKSPACE_ROLES),
  expiresAt: z.iso.datetime(),
  /** E-posta zaten bir hesaba aitse kullanıcı giriş yapıp kabul eder. */
  accountExists: z.boolean(),
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

/** POST /api/invitations/:token/accept — yeni hesap için ad ve şifre zorunlu. */
export const AcceptInvitationRequestSchema = z.object({
  name: PersonNameSchema.optional(),
  password: PasswordSchema.optional(),
  locale: z.enum(LOCALES).optional(),
});
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;

/** Davet kabulünden sonra yönlendirme için. */
export const AcceptInvitationResponseSchema = z.object({ workspaceId: z.uuid() });
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponseSchema>;

/**
 * POST /api/workspaces/:workspaceId/members — yönetici davet beklemeden hesabı doğrudan açar (ADR-092).
 * Şifre verilmezse sunucu üretir ve yalnızca yanıtta bir kez döner. Guest en az bir Space ile açılır.
 */
export const CreateMemberRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: EmailSchema,
    role: z.enum(WORKSPACE_ROLES).exclude(['OWNER']),
    /** En az 8 karakter; boşsa sunucu üretir. */
    password: z.string().min(8).max(256).optional(),
    spaceIds: z.array(z.uuid()).max(50).default([]),
    locale: z.enum(LOCALES).default('tr'),
  })
  .refine((v) => v.role !== 'GUEST' || v.spaceIds.length > 0, {
    path: ['spaceIds'],
    message: ERROR_CODES.GUEST_SPACES_REQUIRED,
  });
export type CreateMemberRequest = z.input<typeof CreateMemberRequestSchema>;
export type CreateMemberData = z.output<typeof CreateMemberRequestSchema>;

export const CreatedMemberSchema = z.object({
  userId: z.uuid(),
  /** Üretilen geçici şifre (şifre verilmediyse); aksi halde null. Bir daha gösterilmez. */
  temporaryPassword: z.string().nullable(),
  /** E-posta zaten bir hesaba aitti: yalnızca workspace'e eklendi, şifre değişmedi. */
  existingAccount: z.boolean(),
});
export type CreatedMember = z.infer<typeof CreatedMemberSchema>;
