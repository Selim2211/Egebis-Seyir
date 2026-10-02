import { zodResolver } from '@hookform/resolvers/zod';
import { type SetupRequest, SetupRequestSchema } from '@scrum/shared';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field, FormError } from '@/components/form';
import { AuthHeading } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { setupStatusQuery, useSetup } from '@/features/auth/queries';
import { useUiStore } from '@/lib/ui-store';

/** İlk kurulum (ADR-034): yalnızca hiç kullanıcı yokken açılır. */
export const Route = createFileRoute('/_auth/setup')({
  beforeLoad: async ({ context }) => {
    const { needsSetup } = await context.queryClient.fetchQuery(setupStatusQuery);
    if (!needsSetup) throw redirect({ to: '/login' });
  },
  component: SetupPage,
});

function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useUiStore((s) => s.language);
  const setup = useSetup();
  const form = useForm<SetupRequest>({
    resolver: zodResolver(SetupRequestSchema),
    defaultValues: {
      setupToken: '',
      workspaceName: '',
      name: '',
      email: '',
      password: '',
      locale: language,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    setup.mutate({ ...values, locale: language }, { onSuccess: () => void navigate({ to: '/' }) }),
  );

  return (
    <>
      <AuthHeading title={t('auth.setup.title')} subtitle={t('auth.setup.subtitle')} />
      <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col gap-4">
        <FormError error={setup.error} />
        <Field
          label={t('auth.setup.token')}
          hint={t('auth.setup.tokenHint')}
          autoComplete="off"
          spellCheck={false}
          className="[&_input]:font-mono"
          error={errors.setupToken}
          {...form.register('setupToken')}
        />
        <Field
          label={t('auth.setup.workspaceName')}
          placeholder={t('auth.setup.workspacePlaceholder')}
          error={errors.workspaceName}
          {...form.register('workspaceName')}
        />
        <p className="mt-2 text-sm font-semibold">{t('auth.setup.ownerSection')}</p>
        <Field
          label={t('auth.name')}
          autoComplete="name"
          placeholder={t('auth.namePlaceholder')}
          error={errors.name}
          {...form.register('name')}
        />
        <Field
          label={t('auth.email')}
          type="email"
          autoComplete="username"
          placeholder={t('auth.emailPlaceholder')}
          error={errors.email}
          {...form.register('email')}
        />
        <Field
          label={t('auth.password')}
          type="password"
          autoComplete="new-password"
          error={errors.password}
          {...form.register('password')}
        />
        <Button type="submit" size="lg" disabled={setup.isPending}>
          {t('auth.setup.submit')}
        </Button>
      </form>
    </>
  );
}
