import { z } from 'zod';
import { WORKSPACE_ROLES } from '../permissions/roles';
import { EmailSchema, LOCALES, PasswordSchema, PersonNameSchema } from './auth';

export const MemberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.string(),
  title: z.string().nullable(),
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

/** POST /api/workspaces/:workspaceId/invitations */
export const CreateInvitationsRequestSchema = z.object({
  emails: z.array(EmailSchema).min(1).max(20),
  role: z.enum(WORKSPACE_ROLES).exclude(['OWNER']),
});
export type CreateInvitationsRequest = z.infer<typeof CreateInvitationsRequestSchema>;

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
