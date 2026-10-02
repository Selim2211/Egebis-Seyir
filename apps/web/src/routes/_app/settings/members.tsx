import {
  checkMemberChange,
  EmailSchema,
  type Member,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Clock, Mail, Send, UserMinus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/user-avatar';
import { useMe } from '@/features/auth/queries';
import {
  useCan,
  useChangeMemberRole,
  useCurrentWorkspace,
  useInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useResendInvitation,
  useRevokeInvitation,
} from '@/features/workspace/queries';
import { formatDate, relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/members')({
  component: MembersPage,
});

const INVITABLE_ROLES = ['MEMBER', 'ADMIN', 'GUEST'] as const;

function MembersPage() {
  const { t } = useTranslation();
  const canManage = useCan(WORKSPACE_PERMISSIONS.MEMBERS_MANAGE);
  return (
    <>
      <PageHeading title={t('members.title')} subtitle={t('members.subtitle')} />
      {canManage && <InviteForm />}
      {canManage && <PendingInvitations />}
      <MembersTable canManage={canManage} />
    </>
  );
}

function InviteForm() {
  const { t } = useTranslation();
  const invite = useInvite();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>('MEMBER');
  const [invalid, setInvalid] = useState<string[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = emails.split(/[,;\s]+/).filter(Boolean);
    const parsed = raw.map((r) => EmailSchema.safeParse(r));
    const bad = raw.filter((_, i) => !parsed[i]!.success);
    setInvalid(bad);
    if (raw.length === 0 || bad.length > 0) return;
    const list = parsed.map((p) => p.data!);
    invite.mutate(
      { emails: list, role },
      {
        onSuccess: () => {
          toast.success(t('members.invited', { count: list.length }));
          setEmails('');
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="bg-card rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-emails">{t('members.inviteLabel')}</Label>
          <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-9 items-center gap-2 rounded-md border px-2.5 shadow-xs focus-within:ring-[3px]">
            <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <input
              id="invite-emails"
              type="text"
              inputMode="email"
              autoComplete="off"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={t('members.invitePlaceholder')}
              aria-describedby="invite-hint"
              aria-invalid={invalid.length > 0 || undefined}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">{t('members.role')}</Label>
          <NativeSelect
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={invite.isPending}>
          <Send />
          {t('members.inviteSubmit')}
        </Button>
      </div>
      <p id="invite-hint" className="text-muted-foreground mt-2 text-xs">
        {invalid.length > 0 ? (
          <span className="text-destructive">
            {t('members.invalidEmails', { emails: invalid.join(', ') })}
          </span>
        ) : (
          `${t('members.inviteHint')} ${t(`roleHelp.${role}`)}`
        )}
      </p>
      {invite.error && (
        <div className="mt-3">
          <FormError error={invite.error} />
        </div>
      )}
    </form>
  );
}

function PendingInvitations() {
  const { t } = useTranslation();
  const { data } = useInvitations(true);
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const errorMessage = useErrorMessage();
  const invitations = data?.invitations ?? [];
  if (invitations.length === 0) return null;

  return (
    <section className="bg-card mt-5 rounded-lg border" aria-labelledby="pending-title">
      <h2 id="pending-title" className="border-b px-4 py-3 text-sm font-semibold">
        {t('members.pendingTitle')}
      </h2>
      <ul className="divide-y">
        {invitations.map((inv) => (
          <li
            key={inv.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
          >
            <Clock className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="font-medium">{inv.email}</span>
            <span className="text-muted-foreground text-xs">
              {t('members.pendingRow', {
                role: t(`roles.${inv.role}`),
                invitedBy: inv.invitedBy,
                date: formatDate(inv.expiresAt),
              })}
            </span>
            <span className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={resend.isPending}
                onClick={() =>
                  resend.mutate(inv.id, {
                    onSuccess: () => toast.success(t('members.resent')),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                {t('members.resend')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() =>
                  revoke.mutate(inv.id, {
                    onSuccess: () => toast.success(t('members.revoked')),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                {t('members.revoke')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MembersTable({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { data, isPending, error } = useMembers();
  const members = data?.members ?? [];

  return (
    <section className="bg-card mt-5 overflow-hidden rounded-lg border">
      {error && (
        <div className="p-4">
          <FormError error={error} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-sm">
          <caption className="px-4 pt-3.5 pb-2.5 text-left font-semibold">
            {isPending ? t('common.loading') : t('members.count', { count: members.length })}
          </caption>
          <thead>
            <tr className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wide uppercase">
              <th scope="col" className="px-4 py-2">
                {t('members.colPerson')}
              </th>
              <th scope="col" className="w-40 px-4 py-2">
                {t('members.colRole')}
              </th>
              <th scope="col" className="w-28 px-4 py-2">
                {t('members.colLastSeen')}
              </th>
              {canManage && (
                <th scope="col" className="w-14 px-4 py-2">
                  <span className="sr-only">{t('members.colActions')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <MemberRow key={m.userId} member={m} members={members} canManage={canManage} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MemberRow({
  member,
  members,
  canManage,
}: {
  member: Member;
  members: Member[];
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useMe();
  const { role: actorRole } = useCurrentWorkspace();
  const changeRole = useChangeMemberRole();
  const remove = useRemoveMember();
  const errorMessage = useErrorMessage();
  const isYou = member.userId === user.id;
  const ownerCount = members.filter((m) => m.role === 'OWNER').length;

  /** Owner kuralları arayüzde de uygulanır; asıl kontrol API'de (shared/domain/members). */
  const allowed = (newRole: WorkspaceRole | null) =>
    checkMemberChange({ actorRole, targetRole: member.role, newRole, ownerCount }).ok;

  const onRoleChange = (role: WorkspaceRole) =>
    changeRole.mutate(
      { userId: member.userId, role },
      {
        onSuccess: () => toast.success(t('members.roleChanged')),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const onRemove = () => {
    if (!window.confirm(t('members.removeConfirm', { name: member.name }))) return;
    remove.mutate(member.userId, {
      onSuccess: () => toast.success(t('members.removed')),
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  return (
    <tr>
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-3">
          <UserAvatar id={member.userId} name={member.name} size={30} />
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {member.name}
              {isYou && (
                <span className="text-muted-foreground font-normal"> ({t('common.you')})</span>
              )}
            </span>
            <span className="text-muted-foreground block truncate text-xs">{member.email}</span>
          </span>
        </span>
      </td>
      <td className="px-4 py-2.5">
        {canManage ? (
          <NativeSelect
            aria-label={t('members.roleFor', { name: member.name })}
            value={member.role}
            disabled={
              changeRole.isPending || !allowed(member.role === 'OWNER' ? 'ADMIN' : member.role)
            }
            onChange={(e) => onRoleChange(e.target.value as WorkspaceRole)}
            className="h-8"
          >
            {WORKSPACE_ROLES.map((r) => (
              <option key={r} value={r} disabled={r !== member.role && !allowed(r)}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          t(`roles.${member.role}`)
        )}
      </td>
      <td className="text-muted-foreground px-4 py-2.5 text-xs">
        {member.lastSeenAt ? relativeTime(member.lastSeenAt) : t('common.never')}
      </td>
      {canManage && (
        <td className="px-4 py-2.5 text-right">
          {!isYou && allowed(null) && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t('members.remove')}: ${member.name}`}
              disabled={remove.isPending}
              onClick={onRemove}
            >
              <UserMinus />
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}
