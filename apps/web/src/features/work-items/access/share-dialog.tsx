import type { ItemAccess, ItemAccessEntry } from '@scrum/shared';
import { Globe, Lock, Plus, ShieldCheck, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useRoleLabel, useSpaceRoleKeys } from '@/features/roles/queries';
import { useTeams } from '@/features/teams/queries';
import { useMembers } from '@/features/workspace/queries';
import { cn } from '@/lib/utils';
import { useClearItemAccess, useItemAccess, usePutItemAccess } from './queries';

/** Öğenin erişim durumunu özetleyen büyük rozet/düğme etiketi. */
export function accessState(access: ItemAccess | undefined): 'inherited' | 'custom' | 'private' {
  if (!access?.root) return 'inherited';
  return access.isPrivate ? 'private' : 'custom';
}

/**
 * "Sharing & permissions" penceresi (ADR-113): Space erişimine kişi/takım ekler ya da öğeyi
 * (ve altındakileri) yalnızca listedekilere gizler. Alt öğeler bu ayarı miras alır.
 */
export function ShareDialog({
  itemId,
  itemKey,
  open,
  onOpenChange,
}: {
  itemId: string;
  itemKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const access = useItemAccess(itemId, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" closeLabel={t('common.close')}>
        {open && access.data && (
          <ShareForm
            key={itemId}
            itemId={itemId}
            itemKey={itemKey}
            access={access.data}
            onDone={() => onOpenChange(false)}
          />
        )}
        {open && !access.data && (
          <DialogHeader>
            <DialogTitle>{t('share.title', { key: itemKey })}</DialogTitle>
            <DialogDescription>{t('common.loading')}</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Draft = Array<{ userId: string | null; teamId: string | null; name: string; roleKey: string }>;

function ShareForm({
  itemId,
  itemKey,
  access,
  onDone,
}: {
  itemId: string;
  itemKey: string;
  access: ItemAccess;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const roleLabel = useRoleLabel();
  const spaceRoles = useSpaceRoleKeys();
  const members = useMembers().data?.members ?? [];
  const teams = useTeams().data?.teams ?? [];
  const put = usePutItemAccess();
  const clear = useClearItemAccess();
  const [isPrivate, setPrivate] = useState(access.own ? access.isPrivate : false);
  const [entries, setEntries] = useState<Draft>(
    access.own ? access.entries.map((e: ItemAccessEntry) => ({ ...e })) : [],
  );
  const [adding, setAdding] = useState('');
  const [addRole, setAddRole] = useState('DEVELOPER');
  const [error, setError] = useState<unknown>(null);

  const listed = new Set(entries.map((e) => e.userId ?? `t:${e.teamId}`));
  const candidates = [
    ...members
      .filter((m) => !listed.has(m.userId))
      .map((m) => ({ id: m.userId, name: m.name, team: false })),
    ...teams
      .filter((x) => !listed.has(`t:${x.id}`))
      .map((x) => ({ id: `t:${x.id}`, name: x.name, team: true })),
  ];
  const state: 'inherited' | 'custom' | 'private' = access.own
    ? access.isPrivate
      ? 'private'
      : 'custom'
    : 'inherited';

  const add = () => {
    const picked = candidates.find((c) => c.id === adding);
    if (!picked) return;
    setEntries((prev) => [
      ...prev,
      {
        userId: picked.team ? null : picked.id,
        teamId: picked.team ? picked.id.slice(2) : null,
        name: picked.name,
        roleKey: addRole,
      },
    ]);
    setAdding('');
  };

  const save = () => {
    setError(null);
    put.mutate(
      {
        itemId,
        body: {
          isPrivate,
          entries: entries.map((e) => ({ userId: e.userId, teamId: e.teamId, roleKey: e.roleKey })),
        },
      },
      {
        onSuccess: () => {
          toast.success(t('share.saved'));
          onDone();
        },
        onError: setError,
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <ShieldCheck className="text-primary size-5" aria-hidden />
          {t('share.title', { key: itemKey })}
        </DialogTitle>
        <DialogDescription>{t('share.subtitle')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <div
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3 text-sm',
            state === 'private' && 'border-amber-500/40 bg-amber-500/10',
            state === 'custom' && 'border-primary/30 bg-primary/5',
          )}
        >
          {state === 'private' ? (
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : state === 'custom' ? (
            <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <Globe className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <p>
            {state === 'inherited' && !access.root && t('share.stateSpace')}
            {state === 'inherited' &&
              access.root &&
              t('share.stateInherited', { key: access.root.key, title: access.root.title })}
            {state !== 'inherited' && t(`share.state.${state}` as 'share.state.custom')}
          </p>
        </div>

        {!access.own && access.root && (
          <p className="text-muted-foreground text-xs">{t('share.overrideHint')}</p>
        )}

        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Switch
            checked={isPrivate}
            onCheckedChange={setPrivate}
            aria-label={t('share.private')}
          />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Lock className="size-3.5" aria-hidden /> {t('share.private')}
            </span>
            <span className="text-muted-foreground block text-xs">{t('share.privateHelp')}</span>
          </span>
        </label>

        <div>
          <h3 className="mb-1.5 text-sm font-semibold">{t('share.people')}</h3>
          {entries.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-3 text-center text-sm">
              {isPrivate ? t('share.emptyPrivate') : t('share.empty')}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {entries.map((e, index) => (
                <li key={e.userId ?? e.teamId} className="flex items-center gap-2 px-3 py-2">
                  {e.teamId ? <Users className="text-muted-foreground size-4" aria-hidden /> : null}
                  <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                  <NativeSelect
                    aria-label={t('share.roleFor', { name: e.name })}
                    value={e.roleKey}
                    className="h-8"
                    onChange={(ev) =>
                      setEntries((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, roleKey: ev.target.value } : x)),
                      )
                    }
                  >
                    {spaceRoles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel('SPACE', r)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t('share.remove', { name: e.name })}
                    onClick={() => setEntries((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <NativeSelect
              aria-label={t('share.add')}
              value={adding}
              className="h-9 min-w-0 flex-1"
              onChange={(e) => setAdding(e.target.value)}
            >
              <option value="">{t('share.choose')}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.team ? `${t('share.team')}: ` : ''}
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label={t('share.newRole')}
              value={addRole}
              className="h-9"
              onChange={(e) => setAddRole(e.target.value)}
            >
              {spaceRoles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel('SPACE', r)}
                </option>
              ))}
            </NativeSelect>
            <Button type="button" variant="secondary" disabled={!adding} onClick={add}>
              <Plus /> {t('share.addButton')}
            </Button>
          </div>
        </div>
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        {access.own && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            disabled={clear.isPending}
            onClick={() =>
              clear.mutate(itemId, {
                onSuccess: () => {
                  toast.success(t('share.reset'));
                  onDone();
                },
                onError: setError,
              })
            }
          >
            {t('share.resetButton')}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={save} disabled={put.isPending}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </>
  );
}
