import { type PutQuotaRequest, type Quota, QuotasResponseSchema } from '@scrum/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTeams } from '@/features/teams/queries';
import { useCurrentWorkspace, useMembers } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/quotas')({ component: QuotasPage });

const MB = 1024 * 1024;

function useQuotas() {
  const { id } = useCurrentWorkspace();
  return useQuery({
    queryKey: ['workspaces', id, 'quotas'],
    queryFn: () => apiRequest(`/workspaces/${id}/quotas`, QuotasResponseSchema),
  });
}

function usePutQuota() {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (body: PutQuotaRequest) =>
      apiRequest(`/workspaces/${id}/quotas`, NoContent, { method: 'PUT', body }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id, 'quotas'] }),
  });
}

const parseLimit = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Number(v)));

/**
 * Yükleme sınırları (yönetici notları madde 3, ADR-154): kişi ya da ekip başına en çok dosya
 * (ek + video) sayısı ve toplam boyut. Boş alan = sınır yok.
 */
function QuotasPage() {
  const { t } = useTranslation();
  const { data, isPending } = useQuotas();
  const quotas = data?.quotas ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeading title={t('quotas.title')} subtitle={t('quotas.description')} />
      <AddQuotaForm existing={quotas} />
      {isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : quotas.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border px-4 py-8 text-center text-sm">
          {t('quotas.empty')}
        </p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-sm" data-testid="quota-table">
            <thead className="text-muted-foreground border-b text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">{t('quotas.target')}</th>
                <th className="px-4 py-2 font-medium">{t('quotas.files')}</th>
                <th className="px-4 py-2 font-medium">{t('quotas.size')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotas.map((q) => (
                <QuotaRow key={q.id} quota={q} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Usage({ used, max, unit }: { used: number; max: number | null; unit: string }) {
  const { t } = useTranslation();
  const ratio = max ? Math.min(1, used / max) : 0;
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <span className="tabular-nums">
        {used} / {max ?? t('quotas.unlimited')} {unit}
      </span>
      {max !== null && (
        <span className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
          <span
            className={ratio >= 0.9 ? 'block h-full bg-red-500' : 'bg-primary block h-full'}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

function QuotaRow({ quota }: { quota: Quota }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const put = usePutQuota();
  const target = quota.target === 'USER' ? { userId: quota.targetId } : { teamId: quota.targetId };
  return (
    <tr>
      <td className="px-4 py-2.5">
        <span className="font-medium">{quota.name}</span>
        <span className="text-muted-foreground ml-2 text-xs">
          {t(`quotas.kind.${quota.target}`)}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <Usage used={quota.usage.files} max={quota.maxFiles} unit={t('quotas.filesUnit')} />
      </td>
      <td className="px-4 py-2.5">
        <Usage used={Math.round(quota.usage.bytes / MB)} max={quota.maxMb} unit="MB" />
      </td>
      <td className="px-4 py-2.5 text-right">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('quotas.remove', { name: quota.name })}
          disabled={put.isPending}
          onClick={() =>
            put.mutate(
              { ...target, maxFiles: null, maxMb: null },
              {
                onSuccess: () => toast.success(t('quotas.removed')),
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}

function AddQuotaForm({ existing }: { existing: Quota[] }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const members = useMembers().data?.members ?? [];
  const teams = useTeams().data?.teams ?? [];
  const put = usePutQuota();
  const [target, setTarget] = useState('');
  const [maxFiles, setMaxFiles] = useState('');
  const [maxMb, setMaxMb] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const [kind, id] = target.split(':') as ['u' | 't', string];
    put.mutate(
      {
        ...(kind === 'u' ? { userId: id } : { teamId: id }),
        maxFiles: parseLimit(maxFiles),
        maxMb: parseLimit(maxMb),
      },
      {
        onSuccess: () => {
          toast.success(t('quotas.saved'));
          setTarget('');
          setMaxFiles('');
          setMaxMb('');
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };
  const current = existing.find(
    (q) => `${q.target === 'USER' ? 'u' : 't'}:${q.targetId}` === target,
  );

  return (
    <form
      onSubmit={submit}
      className="bg-card flex flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">{t('quotas.target')}</span>
        <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} required>
          <option value="">{t('quotas.choose')}</option>
          <optgroup label={t('quotas.people')}>
            {members.map((m) => (
              <option key={m.userId} value={`u:${m.userId}`}>
                {m.name}
              </option>
            ))}
          </optgroup>
          {teams.length > 0 && (
            <optgroup label={t('quotas.teams')}>
              {teams.map((team) => (
                <option key={team.id} value={`t:${team.id}`}>
                  {team.name}
                </option>
              ))}
            </optgroup>
          )}
        </NativeSelect>
      </label>
      <label className="flex w-32 flex-col gap-1 text-sm">
        <span className="font-medium">{t('quotas.maxFiles')}</span>
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder={current?.maxFiles?.toString() ?? t('quotas.unlimited')}
          value={maxFiles}
          onChange={(e) => setMaxFiles(e.target.value)}
        />
      </label>
      <label className="flex w-32 flex-col gap-1 text-sm">
        <span className="font-medium">{t('quotas.maxMb')}</span>
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder={current?.maxMb?.toString() ?? t('quotas.unlimited')}
          value={maxMb}
          onChange={(e) => setMaxMb(e.target.value)}
        />
      </label>
      <Button type="submit" disabled={!target || put.isPending}>
        <Plus /> {t('quotas.save')}
      </Button>
    </form>
  );
}
