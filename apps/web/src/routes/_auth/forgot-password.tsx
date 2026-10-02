import { zodResolver } from '@hookform/resolvers/zod';
import { type ForgotPasswordRequest, ForgotPasswordRequestSchema } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field, FormError } from '@/components/form';
import { AuthHeading, BackToLogin } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { useForgotPassword } from '@/features/auth/queries';

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgot = useForgotPassword();
  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  if (forgot.isSuccess) {
    return (
      <>
        <MailCheck className="text-primary mt-6 size-8" aria-hidden />
        <AuthHeading
          title={t('auth.forgot.sentTitle')}
          subtitle={t('auth.forgot.sentBody', { email: forgot.variables.email })}
        />
        <BackToLogin />
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} />
      <form
        onSubmit={form.handleSubmit((values) => forgot.mutate(values))}
        noValidate
        className="mt-7 flex flex-col gap-4"
      >
        <FormError error={forgot.error} />
        <Field
          label={t('auth.email')}
          type="email"
          autoComplete="username"
          placeholder={t('auth.emailPlaceholder')}
          autoFocus
          error={form.formState.errors.email}
          {...form.register('email')}
        />
        <Button type="submit" size="lg" disabled={forgot.isPending}>
          {t('auth.forgot.submit')}
        </Button>
      </form>
      <BackToLogin />
    </>
  );
}
