import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AuthLayout } from '@/components/layout/auth-layout';

/** Oturumsuz sayfalar: giriş, kurulum, şifre sıfırlama, davet. */
export const Route = createFileRoute('/_auth')({
  component: () => (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  ),
});
