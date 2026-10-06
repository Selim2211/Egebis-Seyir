import { type Team } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormError } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { useCreateTeam, useDeleteTeam, useTeams, useUpdateTeam } from '@/features/teams/queries';
import { useMembers } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/teams')({ component: TeamsPage });

const COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#DB2777'];

/** Ekipler (Faz 7.7, ADR-101): kullanıcı grupları; göreve toplu atamada kısayol. */
function TeamsPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data, isPending } = useTeams();
  const remove = useDeleteTeam();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const teams = data?.teams ?? [];

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <PageHeading title={t('teams.title')} subtitle={t('teams.subtitle')} />
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus />
          {t('teams.add')}
        </Button>
      </div>
      {isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : teams.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-10 text-center text-sm">
          {t('teams.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map((team) => (
            <li key={team.id} className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ backgroundColor: team.color }}
                  aria-hidden
                >
                  <Users className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium">{team.name}</h2>
                  <p className="text-muted-foreground text-xs">
                    {t('teams.memberCount', { count: team.members.length })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('teams.edit', { name: team.name })}
                  onClick={() => setEditing(team)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('teams.delete', { name: team.name })}
                  onClick={() => setDeleting(team)}
                >
                  <Trash2 />
                </Button>
              </div>
              {team.members.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {team.members.map((m) => (
                    <li
                      key={m.id}
                      className="bg-muted flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-1 text-xs"
                    >
                      <UserAvatar
                        id={m.id}
                        name={m.name}
                        size={20}
                        avatarVersion={m.avatarVersion}
                      />
                      {m.name}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TeamDialog team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('teams.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('teams.deleteBody')}
        confirmLabel={t('teams.deleteConfirm')}
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      />
    </div>
  );
}

function TeamDialog({ team, onClose }: { team: Team | null; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const members = (useMembers().data?.members ?? []).filter((m) => m.role !== 'GUEST');
  const [name, setName] = useState(team?.name ?? '');
  const [color, setColor] = useState(team?.color ?? COLORS[0]!);
  const [memberIds, setMemberIds] = useState<string[]>(team?.members.map((m) => m.id) ?? []);
  const mutation = team ? update : create;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    const body = { name: name.trim(), color, memberIds };
    const done = {
      onSuccess: () => {
        toast.success(t('teams.saved'));
        onClose();
      },
    };
    if (team) update.mutate({ teamId: team.id, body }, done);
    else create.mutate(body, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{team ? t('teams.editTitle') : t('teams.addTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('teams.name')}
              <Input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">{t('teams.color')}</legend>
              <div className="flex gap-1.5 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className="size-6 rounded-full border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? 'var(--foreground)' : 'transparent',
                    }}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">{t('teams.members')}</legend>
              <ul className="max-h-56 overflow-y-auto rounded-md border p-1">
                {members.map((m) => (
                  <li key={m.userId}>
                    <label className="hover:bg-accent flex items-center gap-2 rounded px-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(m.userId)}
                        onChange={(e) =>
                          setMemberIds((ids) =>
                            e.target.checked
                              ? [...ids, m.userId]
                              : ids.filter((id) => id !== m.userId),
                          )
                        }
                      />
                      <UserAvatar
                        id={m.userId}
                        name={m.name}
                        size={20}
                        avatarVersion={m.avatarVersion}
                      />
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            {mutation.error && <FormError error={mutation.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending || name.trim() === ''}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
