import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginRequest, LoginRequestSchema } from '@scrum/shared';
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field, FormError } from '@/components/form';
import { AuthHeading } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { meQuery, setupStatusQuery, useLogin } from '@/features/auth/queries';
import { isApiError } from '@/lib/api';

/** Açık yönlendirmeyi (open redirect) önlemek için yalnızca site içi yollar kabul edilir. */
const safePath = (path: string | undefined) =>
  path?.startsWith('/') && !path.startsWith('//') ? path : '/';

export const Route = createFileRoute('/_auth/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    try {
      await context.queryClient.fetchQuery(meQuery);
    } catch (error) {
      if (!isApiError(error, 'UNAUTHENTICATED')) throw error;
      const { needsSetup } = await context.queryClient.fetchQuery(setupStatusQuery);
      if (needsSetup) throw redirect({ to: '/setup' });
      return;
    }
    throw redirect({ href: safePath(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const search = Route.useSearch();
  const login = useLogin();
  const form = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: '', password: '', remember: false },
  });

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: () => void router.navigate({ href: safePath(search.redirect) }),
    }),
  );

  return (
    <>
      <AuthHeading title={t('auth.login.title')} subtitle={t('auth.login.subtitle')} />
      <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col gap-4">
        <FormError error={login.error} />
        <Field
          label={t('auth.email')}
          type="email"
          autoComplete="username"
          placeholder={t('auth.emailPlaceholder')}
          autoFocus
          error={form.formState.errors.email}
          {...form.register('email')}
        />
        <Field
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.password}
          aside={
            <Link to="/forgot-password" className="text-primary hover:underline">
              {t('auth.login.forgot')}
            </Link>
          }
          {...form.register('password')}
        />
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-primary size-4" {...form.register('remember')} />
          {t('auth.login.remember')}
        </label>
        <Button type="submit" size="lg" disabled={login.isPending}>
          {t('auth.login.submit')}
        </Button>
      </form>
      <p className="text-muted-foreground mt-6 border-t pt-5 text-sm">
        {t('auth.login.noAccount')}
      </p>
    </>
  );
}
