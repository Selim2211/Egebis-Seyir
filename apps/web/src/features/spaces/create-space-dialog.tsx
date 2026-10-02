import { SPACE_ROLES, type SpaceRole, suggestSpaceKey } from '@scrum/shared';
import { useNavigate } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserAvatar } from '@/components/user-avatar';
import { useMe } from '@/features/auth/queries';
import { useMembers } from '@/features/workspace/queries';
import { useCreateSpace } from './queries';
import { SpaceFields } from './space-form';
import {
  EMPTY_SPACE,
  type SpaceFormErrors,
  type SpaceFormValues,
  toSpaceBody,
  validateSpace,
} from './space-form-model';

/** "Yeni Space oluştur" penceresi (taslak 7, brief Akış A). */
export function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t('common.close')}>
        {/* İçerik her açılışta sıfırdan kurulur. */}
        {open && <CreateSpaceForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateSpaceForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useMe();
  const create = useCreateSpace();
  const [values, setValues] = useState<SpaceFormValues>(EMPTY_SPACE);
  const [keyEdited, setKeyEdited] = useState(false);
  const [errors, setErrors] = useState<SpaceFormErrors>({});
  const [members, setMembers] = useState<Array<{ userId: string; role: SpaceRole }>>([
    { userId: user.id, role: 'PRODUCT_OWNER' },
  ]);

  const change = (patch: Partial<SpaceFormValues>) => {
    if (patch.key !== undefined) setKeyEdited(true);
    setValues((v) => ({ ...v, ...patch }));
  };
  const changeName = (name: string) =>
    setValues((v) => ({ ...v, name, key: keyEdited ? v.key : suggestSpaceKey(name) }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateSpace(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(
      { ...toSpaceBody(values), members },
      {
        onSuccess: ({ id }) => {
          toast.success(t('spaceForm.created', { name: values.name.trim() }));
          onDone();
          void navigate({ to: '/spaces/$spaceId', params: { spaceId: id } });
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{t('spaceForm.createTitle')}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <SpaceFields values={values} errors={errors} onChange={change} onNameChange={changeName} />
        <MemberPicker members={members} onChange={setMembers} />
        {create.error && <FormError error={create.error} />}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {t('spaceForm.submitCreate')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Üyeler ve Scrum rolleri; Guest yalnızca Stakeholder olabilir (ADR-035). */
function MemberPicker({
  members,
  onChange,
}: {
  members: Array<{ userId: string; role: SpaceRole }>;
  onChange: (members: Array<{ userId: string; role: SpaceRole }>) => void;
}) {
  const { t } = useTranslation();
  const { data } = useMembers();
  const all = data?.members ?? [];
  const byId = new Map(all.map((m) => [m.userId, m]));
  const candidates = all.filter((m) => !members.some((x) => x.userId === m.userId));
  const [adding, setAdding] = useState('');

  return (
    <section aria-labelledby="space-members-title">
      <div className="mb-1 flex items-center gap-2">
        <h3 id="space-members-title" className="text-sm font-medium">
          {t('spaceForm.members')}
        </h3>
      </div>
      <ul className="divide-y">
        {members.map((m) => {
          const person = byId.get(m.userId);
          if (!person) return null;
          const guest = person.role === 'GUEST';
          return (
            <li key={m.userId} className="flex items-center gap-2.5 py-1.5">
              <UserAvatar
                id={person.userId}
                name={person.name}
                size={26}
                avatarVersion={person.avatarVersion}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
              <NativeSelect
                aria-label={t('spaceForm.roleFor', { name: person.name })}
                value={m.role}
                className="h-8"
                onChange={(e) =>
                  onChange(
                    members.map((x) =>
                      x.userId === m.userId ? { ...x, role: e.target.value as SpaceRole } : x,
                    ),
                  )
                }
              >
                {SPACE_ROLES.filter((r) => !guest || r === 'STAKEHOLDER').map((r) => (
                  <option key={r} value={r}>
                    {t(`spaceRoles.${r}`)}
                  </option>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('spaceForm.removeMember', { name: person.name })}
                onClick={() => onChange(members.filter((x) => x.userId !== m.userId))}
              >
                <X />
              </Button>
            </li>
          );
        })}
      </ul>
      {candidates.length > 0 ? (
        <div className="mt-2 flex gap-2">
          <NativeSelect
            aria-label={t('spaceForm.addMember')}
            value={adding}
            className="h-8 min-w-0 flex-1"
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t('spaceForm.chooseMember')}</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} · {t(`roles.${c.role}`)}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!adding}
            onClick={() => {
              const person = byId.get(adding);
              if (!person) return;
              onChange([
                ...members,
                { userId: adding, role: person.role === 'GUEST' ? 'STAKEHOLDER' : 'DEVELOPER' },
              ]);
              setAdding('');
            }}
          >
            <Plus />
            {t('spaceForm.addMember')}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">{t('spaceForm.noOtherMembers')}</p>
      )}
    </section>
  );
}
