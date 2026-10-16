import {
  CreatedSchema,
  type CreateRoleRequest,
  isCustomRoleKey,
  type Role,
  RolesResponseSchema,
  SPACE_ROLES,
  type WorkspaceRole,
  type UpdateRoleRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const rolesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'roles'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/roles`, RolesResponseSchema),
  });

export function useRoles() {
  const { id } = useCurrentWorkspace();
  return useQuery(rolesQuery(id));
}

/** Rol değişince kendi izinlerin de değişebilir; her şeyi yeniden yükler. */
function useRoleMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries(),
  });
}

export const useCreateRole = () =>
  useRoleMutation((id, body: CreateRoleRequest) =>
    apiRequest(`${ws(id)}/roles`, CreatedSchema, { method: 'POST', body }),
  );

export const useUpdateRole = () =>
  useRoleMutation((id, input: { roleId: string; body: UpdateRoleRequest }) =>
    apiRequest(`${ws(id)}/roles/${input.roleId}`, NoContent, { method: 'PATCH', body: input.body }),
  );

export const useResetRole = () =>
  useRoleMutation((id, roleId: string) =>
    apiRequest(`${ws(id)}/roles/${roleId}/reset`, NoContent, { method: 'POST' }),
  );

export const useDeleteRole = () =>
  useRoleMutation((id, input: { roleId: string; reassignToRoleId?: string }) =>
    apiRequest(
      `${ws(id)}/roles/${input.roleId}${
        input.reassignToRoleId ? `?reassignToRoleId=${input.reassignToRoleId}` : ''
      }`,
      NoContent,
      { method: 'DELETE' },
    ),
  );

/** Rolün yetki katmanı: özel workspace rolleri "Member" katmanındadır (ADR-112). */
export const workspaceTier = (key: string): WorkspaceRole =>
  isCustomRoleKey(key) ? 'MEMBER' : (key as WorkspaceRole);

/** Davet/hesap formlarında seçilebilir workspace rolleri: Member, Admin, Guest + özel roller. */
export function useAssignableWorkspaceRoles(): string[] {
  const { data } = useRoles();
  const custom = (data?.roles ?? [])
    .filter((r) => r.scope === 'WORKSPACE' && isCustomRoleKey(r.key))
    .map((r) => r.key);
  return ['MEMBER', 'ADMIN', 'GUEST', ...custom];
}

/** Space üyesi olarak seçilebilir roller (sistem + özel). */
export function useSpaceRoleKeys(): string[] {
  const { data } = useRoles();
  const fromApi = (data?.roles ?? []).filter((r) => r.scope === 'SPACE').map((r) => r.key);
  return fromApi.length > 0 ? fromApi : [...SPACE_ROLES];
}

/**
 * Rolün görünen adı: özel rolde kendi adı, sistem rolünde çevrilmiş ad.
 * Roller yüklenmediyse (veya anahtar tanınmıyorsa) anahtarın kendisi.
 */
export function useRoleLabel() {
  const { t, i18n } = useTranslation();
  const { data } = useRoles();
  const custom = new Map((data?.roles ?? []).map((r) => [r.key, r.name]));
  return (scope: Role['scope'], key: string): string => {
    if (isCustomRoleKey(key)) return custom.get(key) ?? key;
    const path = scope === 'SPACE' ? `spaceRoles.${key}` : `roles.${key}`;
    return i18n.exists(path) ? t(path as never) : key;
  };
}
