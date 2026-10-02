import { zodResolver } from '@hookform/resolvers/zod';
import { type InvitationPreview, PasswordSchema, PersonNameSchema } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Clock, Lock, LinkIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field, FormError } from '@/components/form';
import { AuthHeading, BackToLogin } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { meQuery } from '@/features/auth/queries';
import { invitationPreviewQuery, useAcceptInvitation } from '@/features/workspace/queries';
import { formatDate } from '@/lib/format';
import { useUiStore } from '@/lib/ui-store';

/** Davetle kayıt (ADR-034); taslaktaki "9 · Davetle kayıt" ekranı. */
export const Route = createFileRoute('/_auth/invite/$token')({
  component: InvitePage,
});

function InvitePage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const preview = useQuery(invitationPreviewQuery(token));

  if (preview.isPending)
    return <p className="text-muted-foreground mt-6 text-sm">{t('common.loading')}</p>;
  if (preview.isError) {
    return (
      <>
        <LinkIcon className="text-muted-foreground mt-6 size-7" aria-hidden />
        <AuthHeading
          title={t('auth.invite.invalidTitle')}
          subtitle={t('auth.invite.invalidBody')}
        />
        <BackToLogin />
      </>
    );
  }

  const inv = preview.data;
  return (
    <>
      <AuthHeading title={t('auth.invite.title', { workspace: inv.workspaceName })} />
      <p className="text-muted-foreground mt-2 text-sm">
        <Trans
          i18nKey="auth.invite.invitedBy"
          values={{ name: inv.invitedBy, role: t(`roles.${inv.role}`) }}
          components={[<strong key="b" className="text-foreground" />]}
        />
      </p>
      {inv.accountExists ? (
        <ExistingAccount token={token} invitation={inv} />
      ) : (
        <NewAccount token={token} invitation={inv} />
      )}
      <p className="text-muted-foreground mt-5 flex items-center gap-2 text-xs">
        <Clock className="size-3.5 shrink-0" aria-hidden />
        {t('auth.invite.expires', { date: formatDate(inv.expiresAt) })}
      </p>
    </>
  );
}

const NewAccountSchema = z.object({ name: PersonNameSchema, password: PasswordSchema });

function NewAccount({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useUiStore((s) => s.language);
  const accept = useAcceptInvitation(token);
  const form = useForm<z.infer<typeof NewAccountSchema>>({
    resolver: zodResolver(NewAccountSchema),
    defaultValues: { name: '', password: '' },
  });

  const onSubmit = form.handleSubmit((values) =>
    accept.mutate({ ...values, locale: language }, { onSuccess: () => void navigate({ to: '/' }) }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
      <FormError error={accept.error} />
      <Field
        label={t('auth.email')}
        type="email"
        value={invitation.email}
        readOnly
        hint={t('auth.invite.emailHint')}
        className="[&_input]:bg-muted"
      />
      <Field
        label={t('auth.name')}
        autoComplete="name"
        placeholder={t('auth.namePlaceholder')}
        autoFocus
        error={form.formState.errors.name}
        {...form.register('name')}
      />
      <Field
        label={t('auth.password')}
        type="password"
        autoComplete="new-password"
        error={form.formState.errors.password}
        {...form.register('password')}
      />
      <Button type="submit" size="lg" disabled={accept.isPending}>
        {t('auth.invite.submit')}
      </Button>
    </form>
  );
}

/** E-posta için hesap zaten var: aynı hesapla giriş yapılmışsa tek tıkla katılır. */
function ExistingAccount({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useQuery({ ...meQuery, throwOnError: false });
  const accept = useAcceptInvitation(token);
  const signedInAs = me.data?.user.email;

  if (signedInAs === invitation.email) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <FormError error={accept.error} />
        <Button
          size="lg"
          disabled={accept.isPending}
          onClick={() => accept.mutate({}, { onSuccess: () => void navigate({ to: '/' }) })}
        >
          {t('auth.invite.acceptAs', { email: invitation.email })}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="bg-muted flex gap-2 rounded-md p-3 text-sm">
        <Lock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        {signedInAs
          ? t('auth.invite.wrongAccount', { current: signedInAs, email: invitation.email })
          : t('auth.invite.existingAccount', { email: invitation.email })}
      </p>
      {!signedInAs && (
        <Button asChild size="lg">
          <Link to="/login" search={{ redirect: `/invite/${token}` }}>
            {t('auth.invite.loginToAccept')}
          </Link>
        </Button>
      )}
    </div>
  );
}
