import { z } from 'zod';

/** Rol anahtarı: sistem rolleri (`OWNER`, `DEVELOPER`…) veya özel roller (`custom_<uuid>`), ADR-112. */
export const RoleKeySchema = z.string().min(1).max(64);
export type RoleKey = z.infer<typeof RoleKeySchema>;

export const ROLE_SCOPES = ['WORKSPACE', 'SPACE'] as const;
export type RoleScopeName = (typeof ROLE_SCOPES)[number];

export const CUSTOM_ROLE_PREFIX = 'custom_';
export const isCustomRoleKey = (key: string): boolean => key.startsWith(CUSTOM_ROLE_PREFIX);

export const RoleNameSchema = z.string().trim().min(1).max(40);

export const RoleSchema = z.object({
  id: z.uuid(),
  scope: z.enum(ROLE_SCOPES),
  key: RoleKeySchema,
  /** Özel rollerde görünen ad; sistem rollerinde null (arayüz çevirir). */
  name: z.string().nullable(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  /** Bu rolü kullanan üye sayısı. */
  memberCount: z.number().int(),
});
export type Role = z.infer<typeof RoleSchema>;

/** GET /api/workspaces/:workspaceId/roles */
export const RolesResponseSchema = z.object({ roles: z.array(RoleSchema) });
export type RolesResponse = z.infer<typeof RolesResponseSchema>;

/** POST /api/workspaces/:workspaceId/roles — özel rol. */
export const CreateRoleRequestSchema = z.object({
  scope: z.enum(ROLE_SCOPES),
  name: RoleNameSchema,
  description: z.string().trim().max(200).nullable().optional(),
  permissions: z.array(z.string()).max(100),
});
export type CreateRoleRequest = z.infer<typeof CreateRoleRequestSchema>;

/** PATCH /api/workspaces/:workspaceId/roles/:roleId — ad yalnızca özel rollerde değişir. */
export const UpdateRoleRequestSchema = z.object({
  name: RoleNameSchema.optional(),
  description: z.string().trim().max(200).nullable().optional(),
  permissions: z.array(z.string()).max(100).optional(),
});
export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequestSchema>;
