import {
  isCustomRoleKey,
  PERMISSION_CATALOGUE,
  type Role,
  type RoleScopeName,
  WORKSPACE_PERMISSIONS,
} from '@scrum/shared';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { MoreHorizontal, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError, SelectField } from '@/components/form';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useCreateRole,
  useDeleteRole,
  useResetRole,
  useRoleLabel,
  useRoles,
  useUpdateRole,
} from '@/features/roles/queries';
import { LoadingState } from '@/features/spaces/container-header';
import { useCan } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings/roles')({
  component: RolesPage,
});

/** Rol ve izin matrisi (ADR-112): sistem rolleri düzenlenir, özel roller oluşturulur. */
function RolesPage() {
  const { t } = useTranslation();
  const canEdit = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  const canView = useCan(WORKSPACE_PERMISSIONS.MEMBERS_VIEW);
  const { data } = useRoles();
  const [scope, setScope] = useState<RoleScopeName>('SPACE');
  const [creating, setCreating] = useState(false);

  if (!canView) return <Navigate to="/settings" />;

  return (
    <>
      <PageHeading title={t('rolesPage.title')} subtitle={t('rolesPage.subtitle')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="bg-muted flex rounded-lg p-1">
          {(['SPACE', 'WORKSPACE'] as const).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={scope === value}
              onClick={() => setScope(value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                scope === value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground',
              )}
            >
              {t(`rolesPage.scope.${value}`)}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <Plus /> {t('rolesPage.newRole')}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground mb-3 text-sm">{t(`rolesPage.scopeHelp.${scope}`)}</p>
      {data ? (
        <Matrix
          roles={data.roles.filter((r) => r.scope === scope)}
          scope={scope}
          canEdit={canEdit}
        />
      ) : (
        <LoadingState />
      )}
      <CreateRoleDialog
        open={creating}
        onOpenChange={setCreating}
        scope={scope}
        roles={data?.roles.filter((r) => r.scope === scope) ?? []}
      />
    </>
  );
}

function Matrix({
  roles,
  scope,
  canEdit,
}: {
  roles: Role[];
  scope: RoleScopeName;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const label = useRoleLabel();
  const update = useUpdateRole();
  const errorMessage = useErrorMessage();
  const entries = PERMISSION_CATALOGUE.filter((p) => p.scope === scope);
  const groups = [...new Set(entries.map((p) => p.group))];

  const toggle = (role: Role, permission: string) => {
    const next = role.permissions.includes(permission)
      ? role.permissions.filter((p) => p !== permission)
      : [...role.permissions, permission];
    update.mutate(
      { roleId: role.id, body: { permissions: next } },
      { onError: (error) => toast.error(errorMessage(error)) },
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th scope="col" className="min-w-56 px-3 py-2 text-left font-medium">
              {t('rolesPage.permission')}
            </th>
            {roles.map((role) => (
              <th key={role.id} scope="col" className="min-w-28 px-2 py-2 text-center">
                <RoleHeader
                  role={role}
                  scope={scope}
                  canEdit={canEdit}
                  name={label(scope, role.key)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows
              key={group}
              group={group}
              columns={roles.length}
              permissions={entries.filter((p) => p.group === group).map((p) => p.key)}
              roles={roles}
              canEdit={canEdit}
              onToggle={toggle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  columns,
  permissions,
  roles,
  canEdit,
  onToggle,
}: {
  group: string;
  columns: number;
  permissions: string[];
  roles: Role[];
  canEdit: boolean;
  onToggle: (role: Role, permission: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <tr className="bg-muted/20">
        <th
          colSpan={columns + 1}
          scope="colgroup"
          className="text-muted-foreground px-3 py-1.5 text-left text-xs font-semibold tracking-wide uppercase"
        >
          {t(`permissionGroups.${group}` as never)}
        </th>
      </tr>
      {permissions.map((permission) => (
        <tr key={permission} className="border-t">
          <th scope="row" className="px-3 py-2 text-left font-normal">
            <span className="block">{t(`permissions.${permission}` as never)}</span>
            <code className="text-muted-foreground text-[11px]">{permission}</code>
          </th>
          {roles.map((role) => {
            const locked = role.key === 'OWNER';
            return (
              <td key={role.id} className="px-2 py-2 text-center">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={role.permissions.includes(permission)}
                  disabled={!canEdit || locked}
                  aria-label={`${role.name ?? role.key}: ${permission}`}
                  onChange={() => onToggle(role, permission)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function RoleHeader({
  role,
  scope,
  canEdit,
  name,
}: {
  role: Role;
  scope: RoleScopeName;
  canEdit: boolean;
  name: string;
}) {
  const { t } = useTranslation();
  const reset = useResetRole();
  const rename = useUpdateRole();
  const errorMessage = useErrorMessage();
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const custom = isCustomRoleKey(role.key);
  const locked = role.key === 'OWNER';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        <span className="font-semibold">{name}</span>
        {canEdit && !locked && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={t('rolesPage.actions', { name })}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {custom ? (
                <>
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    {t('rolesPage.rename')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(true)}>
                    <Trash2 /> {t('rolesPage.delete')}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    reset.mutate(role.id, {
                      onSuccess: () => toast.success(t('rolesPage.resetDone', { name })),
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  <RotateCcw /> {t('rolesPage.reset')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <span className="text-muted-foreground text-xs font-normal">
        {locked ? t('rolesPage.locked') : t('rolesPage.members', { count: role.memberCount })}
      </span>
      {custom && (
        <span className="text-primary text-[10px] font-medium">{t('rolesPage.custom')}</span>
      )}
      {renaming && (
        <RenameDialog
          role={role}
          onClose={() => setRenaming(false)}
          onSave={(value) =>
            rename.mutate(
              { roleId: role.id, body: { name: value } },
              {
                onSuccess: () => setRenaming(false),
                onError: (error) => toast.error(errorMessage(error)),
              },
            )
          }
        />
      )}
      {deleting && (
        <DeleteRoleDialog role={role} scope={scope} onClose={() => setDeleting(false)} />
      )}
    </div>
  );
}

function RenameDialog({
  role,
  onSave,
  onClose,
}: {
  role: Role;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(role.name ?? '');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm" closeLabel={t('common.close')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSave(name.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('rolesPage.rename')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field
              label={t('rolesPage.name')}
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  role,
  scope,
  onClose,
}: {
  role: Role;
  scope: RoleScopeName;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data } = useRoles();
  const label = useRoleLabel();
  const remove = useDeleteRole();
  const errorMessage = useErrorMessage();
  const targets = (data?.roles ?? []).filter(
    (r) => r.scope === scope && r.id !== role.id && r.key !== 'OWNER',
  );
  const [reassign, setReassign] = useState(
    targets.find((r) => r.key === (scope === 'SPACE' ? 'STAKEHOLDER' : 'MEMBER'))?.id ?? '',
  );
  const inUse = role.memberCount > 0;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('rolesPage.deleteTitle', { name: role.name })}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <p className="text-sm">
            {inUse
              ? t('rolesPage.deleteInUse', { count: role.memberCount })
              : t('rolesPage.deleteBody')}
          </p>
          {inUse && (
            <SelectField
              label={t('rolesPage.reassignTo')}
              value={reassign}
              onChange={(e) => setReassign(e.target.value)}
            >
              {targets.map((r) => (
                <option key={r.id} value={r.id}>
                  {label(scope, r.key)}
                </option>
              ))}
            </SelectField>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || (inUse && !reassign)}
            onClick={() =>
              remove.mutate(
                { roleId: role.id, reassignToRoleId: inUse ? reassign : undefined },
                {
                  onSuccess: () => {
                    toast.success(t('rolesPage.deleted'));
                    onClose();
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          >
            {t('rolesPage.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateRoleDialog({
  open,
  onOpenChange,
  scope,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: RoleScopeName;
  roles: Role[];
}) {
  const { t } = useTranslation();
  const label = useRoleLabel();
  const create = useCreateRole();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [base, setBase] = useState('');
  const [error, setError] = useState<unknown>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const copy = roles.find((r) => r.id === base);
    const basePermissions =
      copy?.permissions ??
      (scope === 'SPACE' ? ['space.view'] : ['workspace.members.view', 'space.create']);
    setError(null);
    create.mutate(
      {
        scope,
        name: name.trim(),
        description: description.trim() || null,
        permissions: basePermissions.filter((p) => p !== 'workspace.delete'),
      },
      {
        onSuccess: () => {
          toast.success(t('rolesPage.created'));
          setName('');
          setDescription('');
          setBase('');
          onOpenChange(false);
        },
        onError: setError,
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {t('rolesPage.newRoleTitle', { scope: t(`rolesPage.scope.${scope}`) })}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field
              label={t('rolesPage.name')}
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label={t('rolesPage.description')}
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
            />
            <SelectField
              label={t('rolesPage.startFrom')}
              value={base}
              onChange={(e) => setBase(e.target.value)}
            >
              <option value="">{t('rolesPage.startEmpty')}</option>
              {roles
                .filter((r) => r.key !== 'OWNER')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {label(scope, r.key)}
                  </option>
                ))}
            </SelectField>
            <p className="text-muted-foreground text-xs">{t('rolesPage.startHint')}</p>
            <FormError error={error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {t('rolesPage.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
