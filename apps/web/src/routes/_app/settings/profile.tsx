import { zodResolver } from '@hookform/resolvers/zod';
import { PasswordSchema, PersonNameSchema } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field, FormError } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { useChangePassword, useMe, useUpdateProfile } from '@/features/auth/queries';

export const Route = createFileRoute('/_app/settings/profile')({
  component: ProfilePage,
});

const ProfileSchema = z.object({ name: PersonNameSchema, title: z.string().trim().max(100) });
const PasswordFormSchema = z.object({
  currentPassword: PasswordSchema,
  newPassword: PasswordSchema,
});

function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useMe();
  const update = useUpdateProfile();
  const form = useForm<z.infer<typeof ProfileSchema>>({
    resolver: zodResolver(ProfileSchema),
    values: { name: user.name, title: user.title ?? '' },
  });

  const onSubmit = form.handleSubmit(({ name, title }) =>
    update.mutate(
      { name, title: title || null },
      { onSuccess: () => toast.success(t('profile.saved')) },
    ),
  );

  return (
    <>
      <PageHeading title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <form
        onSubmit={onSubmit}
        noValidate
        className="bg-card flex max-w-xl flex-col gap-4 rounded-lg border p-5"
      >
        <div className="flex items-center gap-3">
          <UserAvatar id={user.id} name={user.name} size={48} />
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="text-muted-foreground truncate text-sm">{user.email}</p>
          </div>
        </div>
        <FormError error={update.error} />
        <Field
          label={t('auth.name')}
          autoComplete="name"
          error={form.formState.errors.name}
          {...form.register('name')}
        />
        <Field
          label={t('profile.jobTitle')}
          placeholder={t('profile.jobTitlePlaceholder')}
          error={form.formState.errors.title}
          {...form.register('title')}
        />
        <Field
          label={t('auth.email')}
          type="email"
          value={user.email}
          readOnly
          className="[&_input]:bg-muted"
        />
        <div>
          <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
            {update.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
      <PasswordForm />
    </>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const form = useForm<z.infer<typeof PasswordFormSchema>>({
    resolver: zodResolver(PasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = form.handleSubmit((values) =>
    change.mutate(values, {
      onSuccess: () => {
        toast.success(t('profile.passwordChanged'));
        form.reset();
      },
    }),
  );

  return (
    <section className="mt-8 max-w-xl" aria-labelledby="password-title">
      <h2 id="password-title" className="mb-3 text-base font-semibold">
        {t('profile.passwordTitle')}
      </h2>
      <form
        onSubmit={onSubmit}
        noValidate
        className="bg-card flex flex-col gap-4 rounded-lg border p-5"
      >
        <FormError error={change.error} />
        <Field
          label={t('profile.currentPassword')}
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.currentPassword}
          {...form.register('currentPassword')}
        />
        <Field
          label={t('profile.newPassword')}
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.newPassword}
          {...form.register('newPassword')}
        />
        <div>
          <Button type="submit" variant="outline" disabled={change.isPending}>
            {t('profile.changePassword')}
          </Button>
        </div>
      </form>
    </section>
  );
}
