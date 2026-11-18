import { AUDIT_ENTITY_TYPES, WORKSPACE_PERMISSIONS, type AuditEntityType } from '@scrum/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronDown, Download, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateField } from '@/components/date-field';
import { NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { auditCsvRows, describeAudit } from '@/features/audit/audit-text';
import { auditQuery, type AuditFilter, fetchAllAudit } from '@/features/audit/queries';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { downloadXlsx } from '@/lib/download';
import { formatDateTime } from '@/lib/format';

export const Route = createFileRoute('/_app/settings/audit')({ component: AuditPage });

/** Denetim günlüğü (Faz 8.3, ADR-103): kim, ne zaman, neyi yaptı. Yalnız Sahip/Yönetici. */
function AuditPage() {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const allowed = useCan(WORKSPACE_PERMISSIONS.AUDIT_VIEW);
  const [filter, setFilter] = useState<AuditFilter>({});
  const query = useInfiniteQuery({ ...auditQuery(workspaceId, filter), enabled: allowed });
  const events = useMemo(() => query.data?.pages.flatMap((p) => p.events) ?? [], [query.data]);
  const actors = query.data?.pages[0]?.actors ?? [];
  const set = (patch: Partial<AuditFilter>) =>
    setFilter((f) =>
      Object.fromEntries(
        Object.entries({ ...f, ...patch }).filter(([, v]) => v !== undefined && v !== ''),
      ),
    );

  const [exporting, setExporting] = useState(false);
  /** Süzgece uyan tüm kayıtlar (all=true ise süzgeçsiz hepsi) dosyaya yazılır; yüklenen sayfayla sınırlı değildir. */
  const exportXlsx = async (all: boolean) => {
    setExporting(true);
    try {
      const rows = await fetchAllAudit(workspaceId, all ? {} : filter);
      downloadXlsx(
        `denetim-gunlugu-${new Date().toISOString().slice(0, 10)}.xlsx`,
        auditCsvRows(rows, t),
        t('audit.title'),
      );
    } catch {
      toast.error(t('audit.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  if (!allowed) {
    return <p className="text-muted-foreground text-sm">{t('audit.forbidden')}</p>;
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <PageHeading title={t('audit.title')} subtitle={t('audit.subtitle')} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t('audit.col.who')}
          <NativeSelect
            value={filter.actorId ?? ''}
            onChange={(e) => set({ actorId: e.target.value || undefined })}
            className="h-8 w-32"
          >
            <option value="">{t('audit.all')}</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t('audit.col.type')}
          <NativeSelect
            value={filter.entityType ?? ''}
            onChange={(e) => set({ entityType: (e.target.value || undefined) as AuditEntityType })}
            className="h-8 w-32"
          >
            <option value="">{t('audit.all')}</option>
            {AUDIT_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`audit.entityTypes.${type}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t('audit.from')}
          <DateField
            value={filter.from ?? null}
            onCommit={(from) => set({ from: from ?? '' })}
            className="border-input bg-card h-8 w-32 rounded-md border px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t('audit.to')}
          <DateField
            value={filter.to ?? null}
            onCommit={(to) => set({ to: to ?? '' })}
            className="border-input bg-card h-8 w-32 rounded-md border px-2 text-sm"
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting} className="h-8">
              <Download />
              {t('audit.export')}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => void exportXlsx(false)}>
              {t('audit.exportFiltered')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportXlsx(true)}>
              {t('audit.exportAll')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {Object.keys(filter).length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFilter({})}>
            <X />
            {t('view.clear')}
          </Button>
        )}
      </div>

      {query.isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : events.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          {t('audit.empty')}
        </p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium whitespace-nowrap">{t('audit.col.when')}</th>
                <th className="px-3 py-2 font-medium">{t('audit.col.who')}</th>
                <th className="px-3 py-2 font-medium">{t('audit.col.object')}</th>
                <th className="px-3 py-2 font-medium">{t('audit.col.what')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="text-muted-foreground px-3 py-2 whitespace-nowrap tabular-nums">
                    {formatDateTime(e.at)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {e.actor && (
                        <UserAvatar
                          id={e.actor.id}
                          name={e.actor.name}
                          size={20}
                          avatarVersion={e.actor.avatarVersion}
                        />
                      )}
                      {e.actor?.name ?? t('activity.system')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground mr-1.5 text-xs">
                      {t(`audit.entityTypes.${e.entityType}`, { defaultValue: e.entityType })}
                    </span>
                    {e.item ? (
                      <ItemOpenLink itemKey={e.item.key} className="font-medium hover:underline">
                        {e.entityLabel}
                      </ItemOpenLink>
                    ) : (
                      <span className="font-medium">{e.entityLabel ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{describeAudit(e, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('activity.more')}
          </Button>
        </div>
      )}
    </div>
  );
}
