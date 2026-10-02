import { zodResolver } from '@hookform/resolvers/zod';
import { PasswordSchema } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field, FormError } from '@/components/form';
import { AuthHeading, BackToLogin } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { useResetPassword } from '@/features/auth/queries';

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
});

const FormSchema = z.object({ password: PasswordSchema });

function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = Route.useSearch();
  const reset = useResetPassword();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { password: '' },
  });

  if (!token) {
    return (
      <>
        <AuthHeading title={t('auth.reset.title')} subtitle={t('auth.reset.missingToken')} />
        <BackToLogin />
      </>
    );
  }

  if (reset.isSuccess) {
    return (
      <>
        <CircleCheck className="text-status-done mt-6 size-8" aria-hidden />
        <AuthHeading title={t('auth.reset.doneTitle')} subtitle={t('auth.reset.doneBody')} />
        <BackToLogin />
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} />
      <form
        onSubmit={form.handleSubmit(({ password }) => reset.mutate({ token, password }))}
        noValidate
        className="mt-7 flex flex-col gap-4"
      >
        <FormError error={reset.error} />
        <Field
          label={t('auth.reset.password')}
          type="password"
          autoComplete="new-password"
          autoFocus
          error={form.formState.errors.password}
          {...form.register('password')}
        />
        <Button type="submit" size="lg" disabled={reset.isPending}>
          {t('auth.reset.submit')}
        </Button>
      </form>
    </>
  );
}
