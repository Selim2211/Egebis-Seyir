import {
  PERMISSION_CATALOGUE,
  ProjectRolesResponseSchema,
  type ProjectRoleSetting,
} from '@scrum/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useRoleLabel } from '@/features/roles/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Proje ayarları → Rol yetkileri (ADR-161). Proje Yöneticisi ve Proje Üyesi için Proje bazında
 * açılıp kapatılan izinler; Proje Yöneticisi rolünü yalnızca Super Admin değiştirir.
 */
export function ProjectRolesSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const roleLabel = useRoleLabel();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const path = `/workspaces/${workspaceId}/spaces/${spaceId}/role-permissions`;
  const query = useQuery({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'role-permissions'],
    queryFn: () => apiRequest(path, ProjectRolesResponseSchema),
  });
  const save = useMutation({
    mutationFn: (body: { role: string; permissions: string[] | null }) =>
      apiRequest(path, NoContent, { method: 'PUT', body }),
    onSuccess: () => toast.success(t('projectRoles.saved')),
    onError: (e) => toast.error(errorMessage(e)),
    // İzinler Proje görünümlerini de değiştirir (ör. sprint düğmeleri).
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId] }),
  });

  if (!query.data) return null;
  const { roles, configurable } = query.data;
  const entries = PERMISSION_CATALOGUE.filter((p) => configurable.includes(p.key));
  const groups = [...new Set(entries.map((p) => p.group))];
  const toggle = (role: ProjectRoleSetting, permission: string, on: boolean) =>
    save.mutate({
      role: role.role,
      permissions: on
        ? [...role.permissions, permission]
        : role.permissions.filter((p) => p !== permission),
    });

  return (
    <section className="bg-card mb-5 rounded-lg border" data-testid="project-roles">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('projectRoles.title')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('projectRoles.description')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-2 text-left font-medium">{t('projectRoles.permission')}</th>
              {roles.map((role) => (
                <th key={role.role} className="w-36 px-2 py-2 text-center align-top font-medium">
                  <div>{roleLabel('SPACE', role.role)}</div>
                  {role.customized && role.editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground mt-0.5 h-6 gap-1 px-1.5 text-[11px]"
                      disabled={save.isPending}
                      onClick={() => save.mutate({ role: role.role, permissions: null })}
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      {t('projectRoles.reset')}
                    </Button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <PermissionGroup key={group} group={group} columns={roles.length + 1}>
                {entries
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <tr key={p.key} className="border-b last:border-b-0">
                      <td className="px-4 py-2">{t(`permissions.${p.key}` as never)}</td>
                      {roles.map((role) => (
                        <td key={role.role} className="px-2 py-2 text-center">
                          <Switch
                            checked={role.permissions.includes(p.key)}
                            disabled={!role.editable || save.isPending}
                            onCheckedChange={(on) => toggle(role, p.key, on)}
                            aria-label={`${roleLabel('SPACE', role.role)}: ${t(`permissions.${p.key}` as never) as string}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </PermissionGroup>
            ))}
          </tbody>
        </table>
      </div>
      {roles.some((r) => !r.editable) && (
        <p className="text-muted-foreground border-t px-4 py-2 text-xs">
          {t('projectRoles.managerOnlySuperAdmin')}
        </p>
      )}
    </section>
  );
}

function PermissionGroup({
  group,
  columns,
  children,
}: {
  group: string;
  columns: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={columns} className="text-muted-foreground px-4 py-1.5 text-xs font-semibold">
          {t(`permissionGroups.${group}` as never)}
        </td>
      </tr>
      {children}
    </>
  );
}
