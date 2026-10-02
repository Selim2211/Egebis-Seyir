import { z } from 'zod';
import { WORKSPACE_ROLES } from '../permissions/roles';

export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

/** E-postalar her yerde küçük harfe çevrilip kırpılarak saklanır ve karşılaştırılır. */
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Şifre politikası geliştirme aşamasında uygulanmaz (ADR-034 açık nokta).
 * Üst sınır, argon2 hesaplamasının kötüye kullanılmasını önler.
 */
export const PasswordSchema = z.string().min(1).max(256);

export const PersonNameSchema = z.string().trim().min(1).max(100);

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  locale: z.enum(LOCALES),
  theme: z.enum(THEMES),
  timezone: z.string(),
  avatarVersion: z.string().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const MyWorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.enum(WORKSPACE_ROLES),
  permissions: z.array(z.string()),
});
export type MyWorkspace = z.infer<typeof MyWorkspaceSchema>;

/** GET /api/auth/me */
export const MeResponseSchema = z.object({
  user: UserSchema,
  workspaces: z.array(MyWorkspaceSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** GET /api/setup/status */
export const SetupStatusSchema = z.object({ needsSetup: z.boolean() });
export type SetupStatus = z.infer<typeof SetupStatusSchema>;

/** POST /api/setup — ilk Owner ve workspace (ADR-034). */
export const SetupRequestSchema = z.object({
  setupToken: z.string().min(1).max(200),
  workspaceName: z.string().trim().min(1).max(80),
  name: PersonNameSchema,
  email: EmailSchema,
  password: PasswordSchema,
  locale: z.enum(LOCALES),
});
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

/** POST /api/auth/login */
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  remember: z.boolean().default(false),
});
export type LoginRequest = z.input<typeof LoginRequestSchema>;

/** POST /api/auth/password/forgot — kullanıcı var mı sızdırmamak için her zaman 204. */
export const ForgotPasswordRequestSchema = z.object({ email: EmailSchema });
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

/** POST /api/auth/password/reset */
export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1).max(200),
  password: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const SessionSchema = z.object({
  id: z.uuid(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});
export type Session = z.infer<typeof SessionSchema>;

/** GET /api/auth/sessions */
export const SessionsResponseSchema = z.object({ sessions: z.array(SessionSchema) });
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>;

/** PATCH /api/users/me */
export const UpdateProfileRequestSchema = z
  .object({
    name: PersonNameSchema,
    title: z.string().trim().max(100).nullable(),
    locale: z.enum(LOCALES),
    theme: z.enum(THEMES),
    timezone: z.string().min(1).max(64),
  })
  .partial();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

/** POST /api/users/me/password — diğer oturumlar kapatılır. */
export const ChangePasswordRequestSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
