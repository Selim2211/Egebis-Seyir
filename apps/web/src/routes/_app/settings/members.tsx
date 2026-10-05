import {
  checkMemberChange,
  EmailSchema,
  type Member,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Clock, Copy, Mail, Send, UserMinus, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/user-avatar';
import { useMe } from '@/features/auth/queries';
import { useHierarchy } from '@/features/spaces/queries';
import { SpaceAvatar } from '@/features/spaces/space-avatar';
import {
  useCan,
  useChangeMemberRole,
  useCreateMember,
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
      {canManage && <CreateAccountForm />}
      {canManage && <InviteForm />}
      {canManage && <PendingInvitations />}
      <MembersTable canManage={canManage} />
    </>
  );
}

/** Yönetici hesabı doğrudan açar (ADR-092): e-posta/davet gerekmez; bilgiler ekranda verilir. */
function CreateAccountForm() {
  const { t } = useTranslation();
  const create = useCreateMember();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>('MEMBER');
  const [password, setPassword] = useState('');
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [spacesMissing, setSpacesMissing] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [done, setDone] = useState<{
    email: string;
    password: string | null;
    existing: boolean;
  } | null>(null);
  const guest = role === 'GUEST';
  const shortPassword = password.length > 0 && password.length < 8;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = EmailSchema.safeParse(email.trim());
    setEmailInvalid(!parsed.success);
    const missing = guest && spaceIds.length === 0;
    setSpacesMissing(missing);
    if (!name.trim() || !parsed.success || shortPassword || missing) return;
    create.mutate(
      {
        name: name.trim(),
        email: parsed.data,
        role,
        ...(password ? { password } : {}),
        spaceIds: guest ? spaceIds : [],
      },
      {
        onSuccess: (created) => {
          setDone({
            email: parsed.data,
            password: password || created.temporaryPassword,
            existing: created.existingAccount,
          });
          setName('');
          setEmail('');
          setPassword('');
          setSpaceIds([]);
        },
      },
    );
  };

  return (
    <section className="bg-card mb-4 rounded-lg border p-4" aria-labelledby="create-account-title">
      <h2 id="create-account-title" className="text-sm font-semibold">
        {t('members.createTitle')}
      </h2>
      <p className="text-muted-foreground mt-0.5 mb-3 text-xs">{t('members.createHint')}</p>
      <form onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-name">{t('members.createName')}</Label>
            <Input
              id="create-name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-email">{t('members.createEmail')}</Label>
            <Input
              id="create-email"
              type="email"
              value={email}
              aria-invalid={emailInvalid || undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailInvalid && (
              <p className="text-destructive text-xs">
                {t('members.invalidEmails', { emails: email })}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-role">{t('members.role')}</Label>
            <NativeSelect
              id="create-role"
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-password">{t('members.createPassword')}</Label>
            <Input
              id="create-password"
              type="text"
              autoComplete="off"
              value={password}
              placeholder={t('members.createPasswordPlaceholder')}
              aria-invalid={shortPassword || undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p
              className={
                shortPassword ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
              }
            >
              {t('members.createPasswordHint')}
            </p>
          </div>
        </div>
        {guest && (
          <GuestSpaces selected={spaceIds} missing={spacesMissing} onChange={setSpaceIds} />
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" disabled={create.isPending}>
            <UserPlus />
            {t('members.createSubmit')}
          </Button>
        </div>
        {create.error && (
          <div className="mt-3">
            <FormError error={create.error} />
          </div>
        )}
      </form>
      {done && (
        <div
          role="status"
          className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-500/40 dark:bg-emerald-500/10"
        >
          <p className="font-medium">
            {done.existing
              ? t('members.createdExisting', { email: done.email })
              : t('members.created', { email: done.email })}
          </p>
          {done.password && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-muted-foreground text-xs">{t('members.createPassword')}:</span>
              <code
                aria-label={t('members.passwordValue')}
                className="bg-background rounded border px-2 py-1 text-xs"
              >
                {done.password}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`${done.email} / ${done.password ?? ''}`);
                  toast.success(t('members.copied'));
                }}
              >
                <Copy />
                {t('members.copyLogin')}
              </Button>
            </div>
          )}
          <p className="text-muted-foreground mt-2 text-xs">{t('members.shareOnce')}</p>
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => setDone(null)}>
            {t('common.close')}
          </Button>
        </div>
      )}
    </section>
  );
}

function InviteForm() {
  const { t } = useTranslation();
  const invite = useInvite();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>('MEMBER');
  const [invalid, setInvalid] = useState<string[]>([]);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [spacesMissing, setSpacesMissing] = useState(false);
  const guest = role === 'GUEST';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = emails.split(/[,;\s]+/).filter(Boolean);
    const parsed = raw.map((r) => EmailSchema.safeParse(r));
    const bad = raw.filter((_, i) => !parsed[i]!.success);
    setInvalid(bad);
    // Guest yalnızca seçilen Space'leri görür; en az bir Space gerekir (ADR-043).
    const missing = guest && spaceIds.length === 0;
    setSpacesMissing(missing);
    if (raw.length === 0 || bad.length > 0 || missing) return;
    const list = parsed.map((p) => p.data!);
    invite.mutate(
      { emails: list, role, spaceIds: guest ? spaceIds : [] },
      {
        onSuccess: () => {
          toast.success(t('members.invited', { count: list.length }));
          setEmails('');
          setSpaceIds([]);
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
      {guest && (
        <GuestSpaces
          selected={spaceIds}
          missing={spacesMissing}
          onChange={(ids) => {
            setSpaceIds(ids);
            setSpacesMissing(false);
          }}
        />
      )}
      {invite.error && (
        <div className="mt-3">
          <FormError error={invite.error} />
        </div>
      )}
    </form>
  );
}

/** Guest davetinde paylaşılacak Space'ler (ADR-035). */
function GuestSpaces({
  selected,
  missing,
  onChange,
}: {
  selected: string[];
  missing: boolean;
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const spaces = useHierarchy().data?.spaces ?? [];
  return (
    <fieldset className="mt-4 border-t pt-3" aria-describedby="guest-spaces-hint">
      <legend className="text-sm font-medium">{t('members.guestSpaces')}</legend>
      <p
        id="guest-spaces-hint"
        className={
          missing ? 'text-destructive mt-0.5 text-xs' : 'text-muted-foreground mt-0.5 text-xs'
        }
      >
        {missing ? t('members.guestSpacesRequired') : t('members.guestSpacesHint')}
      </p>
      {spaces.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">{t('members.noSpacesToShare')}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {spaces.map((space) => {
            const checked = selected.includes(space.id);
            return (
              <label
                key={space.id}
                className="has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked ? selected.filter((id) => id !== space.id) : [...selected, space.id],
                    )
                  }
                />
                <SpaceAvatar space={space} size={16} />
                {space.name}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
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
          <UserAvatar
            id={member.userId}
            name={member.name}
            size={30}
            avatarVersion={member.avatarVersion}
          />
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
