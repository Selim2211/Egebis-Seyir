import { type HandoverProject } from '@scrum/shared';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
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
import { useHandoverPlan } from './queries';

/**
 * Üye çıkarma onayı ve açık işlerin devri (ADR-153). Her Proje için varsayılan alıcı Proje
 * Yöneticisidir; çıkarılan kişi yöneticiyse ya da Projede yönetici yoksa alıcıyı seçmek zorunludur.
 */
export function HandoverDialog({
  person,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  person: { userId: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reassign: Record<string, string>) => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const plan = useHandoverPlan(person.userId, open);
  const [picked, setPicked] = useState<Record<string, string>>({});
  // Varsayılan alıcı (Proje Yöneticisi) üzerine kullanıcının seçimi yazılır.
  const choice: Record<string, string> = {
    ...Object.fromEntries(
      (plan.data?.projects ?? [])
        .filter((p) => p.defaultAssigneeId)
        .map((p) => [p.spaceId, p.defaultAssigneeId!]),
    ),
    ...picked,
  };

  const withWork = plan.data?.projects.filter((p) => p.openItems > 0) ?? [];
  const managedOnly = plan.data?.projects.filter((p) => p.isManager && p.openItems === 0) ?? [];
  const missing = withWork.some((p) => !choice[p.spaceId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" className="max-w-lg" data-testid="handover-dialog">
        <DialogHeader>
          <DialogTitle>{t('members.removeTitle', { name: person.name })}</DialogTitle>
          <DialogDescription>{t('handover.intro', { name: person.name })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-3">
          {plan.isPending ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
            </p>
          ) : withWork.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('handover.nothing')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {withWork.map((project) => (
                <HandoverRow
                  key={project.spaceId}
                  project={project}
                  value={choice[project.spaceId] ?? ''}
                  onChange={(userId) => setPicked((c) => ({ ...c, [project.spaceId]: userId }))}
                />
              ))}
            </ul>
          )}
          {managedOnly.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {t('handover.managerOf', { projects: managedOnly.map((p) => p.name).join(', ') })}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={pending || plan.isPending || missing}
            onClick={() => onConfirm(choice)}
            data-testid="handover-confirm"
          >
            {withWork.length > 0 ? t('handover.confirm') : t('members.remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoverRow({
  project,
  value,
  onChange,
}: {
  project: HandoverProject;
  value: string;
  onChange: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const id = `handover-${project.spaceId}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <span className="text-muted-foreground font-mono text-xs">{project.key}</span>{' '}
          {project.name}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('handover.openItems', { count: project.openItems })}
          {project.isManager && ` · ${t('handover.isManager')}`}
        </p>
      </div>
      <ArrowRightLeft className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <label htmlFor={id} className="sr-only">
        {t('handover.to', { project: project.name })}
      </label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-52"
        aria-invalid={!value || undefined}
      >
        <option value="" disabled>
          {project.candidates.length === 0 ? t('handover.noCandidates') : t('handover.choose')}
        </option>
        {project.candidates.map((c) => (
          <option key={c.userId} value={c.userId}>
            {c.name}
            {c.isManager ? ` (${t('spaceRoles.PROJECT_MANAGER')})` : ''}
          </option>
        ))}
      </NativeSelect>
    </li>
  );
}
