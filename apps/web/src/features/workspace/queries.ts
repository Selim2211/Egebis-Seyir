import {
  CreatedMemberSchema,
  type CreateMemberRequest,
  AcceptInvitationResponseSchema,
  type AcceptInvitationRequest,
  type CreateInvitationsRequest,
  InvitationPreviewSchema,
  type ContentAccess,
  HandoverPlanSchema,
  InvitationsResponseSchema,
  MembersResponseSchema,
  OutsourceResponseSchema,
  type MyWorkspace,
  type Permission,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meQuery, useMe } from '@/features/auth/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { useUiStore } from '@/lib/ui-store';

/** Seçili workspace: son seçilen, yoksa ilk üyelik. */
export function useCurrentWorkspace(): MyWorkspace {
  const me = useMe();
  const selected = useUiStore((s) => s.workspaceId);
  const ws = me.workspaces.find((w) => w.id === selected) ?? me.workspaces[0];
  if (!ws) throw new Error('Kullanıcının workspace üyeliği yok');
  return ws;
}

/** Arayüzde buton gizleme/pasifleştirme içindir; asıl kontrol her zaman API'de (ADR-011). */
export function useCan(permission: Permission): boolean {
  return useCurrentWorkspace().permissions.includes(permission);
}

const ws = (id: string) => `/workspaces/${id}`;

export const membersQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'members'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/members`, MembersResponseSchema),
  });

export const invitationsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'invitations'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/invitations`, InvitationsResponseSchema),
  });

export function useMembers(enabled = true) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...membersQuery(id), enabled });
}

export function useInvitations(enabled: boolean) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...invitationsQuery(id), enabled });
}

function useWorkspaceMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useInvite = () =>
  useWorkspaceMutation((id, body: CreateInvitationsRequest) =>
    apiRequest(`${ws(id)}/invitations`, NoContent, { method: 'POST', body }),
  );

export const useCreateMember = () =>
  useWorkspaceMutation((id, body: CreateMemberRequest) =>
    apiRequest(`${ws(id)}/members`, CreatedMemberSchema, { method: 'POST', body }),
  );

export const useResendInvitation = () =>
  useWorkspaceMutation((id, invitationId: string) =>
    apiRequest(`${ws(id)}/invitations/${invitationId}/resend`, NoContent, { method: 'POST' }),
  );

export const useRevokeInvitation = () =>
  useWorkspaceMutation((id, invitationId: string) =>
    apiRequest(`${ws(id)}/invitations/${invitationId}`, NoContent, { method: 'DELETE' }),
  );

export const useChangeMemberRole = () =>
  useWorkspaceMutation((id, input: { userId: string; role: string }) =>
    apiRequest(`${ws(id)}/members/${input.userId}`, NoContent, {
      method: 'PATCH',
      body: { role: input.role },
    }),
  );

/** Üyeyi çıkarır; açık işler `reassign` (Proje → alıcı) ile devredilir (ADR-153). */
export function useRemoveMember() {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: { userId: string; reassign?: Record<string, string> }) =>
      apiRequest(`${ws(id)}/members/${input.userId}`, NoContent, {
        method: 'DELETE',
        body: { reassign: input.reassign ?? {} },
      }),
    // Atamalar değiştiği için tüm önbellek tazelenir.
    onSettled: () => qc.invalidateQueries(),
  });
}

export const handoverQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'members', userId, 'handover'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/members/${userId}/handover`, HandoverPlanSchema),
  });

export function useHandoverPlan(userId: string, enabled: boolean) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...handoverQuery(id, userId), enabled, staleTime: 0 });
}

export const outsourceQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'outsource'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/members/outsource`, OutsourceResponseSchema),
  });

export function useOutsource(enabled = true) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...outsourceQuery(id), enabled });
}

export const useSetContentAccess = () =>
  useWorkspaceMutation((id, input: { userId: string; contentAccess: ContentAccess }) =>
    apiRequest(`${ws(id)}/members/${input.userId}/content-access`, NoContent, {
      method: 'PATCH',
      body: { contentAccess: input.contentAccess },
    }),
  );

// ---------- Davet bağlantısı (oturumsuz) ----------

export const invitationPreviewQuery = (token: string) =>
  queryOptions({
    queryKey: ['invitation', token],
    queryFn: () => apiRequest(`/invitations/${encodeURIComponent(token)}`, InvitationPreviewSchema),
    retry: false,
  });

export function useAcceptInvitation(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AcceptInvitationRequest) =>
      apiRequest(
        `/invitations/${encodeURIComponent(token)}/accept`,
        AcceptInvitationResponseSchema,
        {
          method: 'POST',
          body,
        },
      ),
    onSuccess: async ({ workspaceId }) => {
      useUiStore.getState().setWorkspaceId(workspaceId);
      await qc.invalidateQueries({ queryKey: meQuery.queryKey });
    },
  });
}
