import {
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  MeResponseSchema,
  type MeResponse,
  type ResetPasswordRequest,
  type SetupRequest,
  SessionsResponseSchema,
  SetupStatusSchema,
  type UpdateProfileRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, NoContent } from '@/lib/api';

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => apiRequest('/auth/me', MeResponseSchema),
  retry: false,
  staleTime: 5 * 60_000,
});

export const setupStatusQuery = queryOptions({
  queryKey: ['setup-status'],
  queryFn: () => apiRequest('/setup/status', SetupStatusSchema),
  staleTime: 0,
});

export const sessionsQuery = queryOptions({
  queryKey: ['sessions'],
  queryFn: () => apiRequest('/auth/sessions', SessionsResponseSchema),
});

/** Oturum açmış kullanıcı. Yalnızca giriş gerektiren rotalarda kullanılır (_app). */
export function useMe(): MeResponse {
  const { data } = useQuery(meQuery);
  if (!data) throw new Error('useMe: oturum yok');
  return data;
}

function useSetMe() {
  const qc = useQueryClient();
  return (me: MeResponse) => {
    qc.setQueryData(meQuery.queryKey, me);
    void qc.invalidateQueries({ queryKey: setupStatusQuery.queryKey });
  };
}

export function useSetup() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: SetupRequest) =>
      apiRequest('/setup', MeResponseSchema, { method: 'POST', body }),
    onSuccess: setMe,
  });
}

export function useLogin() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiRequest('/auth/login', MeResponseSchema, { method: 'POST', body }),
    onSuccess: setMe,
  });
}

/**
 * Çıkış: oturum kapanınca tam sayfa yenilemeyle giriş ekranına gidilir. Böylece bellekteki
 * tüm veri (önbellek, durum) güvenle silinir ve açık bileşenlerle yarış durumu oluşmaz.
 */
export function useLogout() {
  return useMutation({
    mutationFn: () => apiRequest('/auth/logout', NoContent, { method: 'POST' }),
    onSettled: () => window.location.replace('/login'),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordRequest) =>
      apiRequest('/auth/password/forgot', NoContent, { method: 'POST', body }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordRequest) =>
      apiRequest('/auth/password/reset', NoContent, { method: 'POST', body }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) =>
      apiRequest('/users/me', MeResponseSchema, { method: 'PATCH', body }),
    onSuccess: (me) => qc.setQueryData(meQuery.queryKey, me),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      apiRequest('/users/me/password', NoContent, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionsQuery.queryKey }),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/auth/sessions/${id}`, NoContent, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionsQuery.queryKey }),
  });
}

/** Profil fotoğrafı yükleme ve silme (ADR-059); yanıt güncel kullanıcıdır. */
export function useAvatar() {
  const qc = useQueryClient();
  const onSuccess = (me: MeResponse) => qc.setQueryData(meQuery.queryKey, me);
  const upload = useMutation({
    mutationFn: (file: Blob) => {
      const form = new FormData();
      form.append('file', file, 'avatar');
      return apiRequest('/users/me/avatar', MeResponseSchema, { method: 'POST', body: form });
    },
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: () => apiRequest('/users/me/avatar', MeResponseSchema, { method: 'DELETE' }),
    onSuccess,
  });
  return { upload, remove };
}
