import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  type Bug,
  type BugSeverity,
  type BugStatus,
  PRIORITIES,
  type Priority,
  SPACE_PERMISSIONS as S,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bug as BugIcon, FolderInput, Mail, Paperclip, Plus, X } from 'lucide-react';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError, NativeSelect, SelectField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/user-avatar';
import { useMe } from '@/features/auth/queries';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery, useSpaceMembers } from '@/features/spaces/queries';
import { ScrumTabs } from '@/features/sprints/scrum-tabs';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { ItemPanel } from '@/features/work-items/detail/item-panel';
import { MoveItemDialog } from '@/features/work-items/move-item-dialog';
import { useUploadAttachment } from '@/features/work-items/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { useAssignBug, useBugs, useReportBug, useSetBugStatus } from './queries';

export interface BugsSearch {
  state?: BugStatus;
  item?: string;
  report?: boolean;
}

const STATUS_STYLE: Record<BugStatus, string> = {
  UNASSIGNED: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  ASSIGNED: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
  RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300',
};
const SEVERITY_STYLE: Record<BugSeverity, string> = {
  CRITICAL: 'text-red-700 dark:text-red-300 font-semibold',
  MAJOR: 'text-orange-700 dark:text-orange-300',
  MINOR: 'text-muted-foreground',
  TRIVIAL: 'text-muted-foreground',
};

/** Sprint panosu ve Kanban'daki kırmızı "Bugs" düğmesi: açık Bug sayısıyla Bug ekranına götürür. */
export function BugsButton({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const open = useBugs(spaceId).data?.bugs.filter((b) => b.bugStatus !== 'RESOLVED').length ?? 0;
  return (
    <Button
      asChild
      size="lg"
      variant="destructive"
      className="font-semibold shadow-lg shadow-red-600/30"
    >
      <Link to="/spaces/$spaceId/bugs" params={{ spaceId }} data-testid="bugs-button">
        <BugIcon className="size-5" aria-hidden />
        {t('bugs.button')}
        {open > 0 && (
          <span className="rounded-full bg-white/25 px-2 text-xs tabular-nums">{open}</span>
        )}
      </Link>
    </Button>
  );
}

/**
 * Bug ekranı (ADR-117, Jira mantığı): Bug'ı açan kişi sahibidir; atama yetkisi olan kişi Bug'ı birine
 * atar; durum Atanmadı → Atandı → İşleniyor → Çözüldü. Her adım bildirim ve e-posta gönderir.
 */
export function BugsPage({
  spaceId,
  search,
  onSearch,
}: {
  spaceId: string;
  search: BugsSearch;
  onSearch: (patch: Partial<BugsSearch>) => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const bugs = useBugs(spaceId);
  const all = useMemo(() => bugs.data?.bugs ?? [], [bugs.data]);
  const shown = search.state ? all.filter((b) => b.bugStatus === search.state) : all;

  if (space.isPending || bugs.isPending) return <LoadingState />;
  if (space.isError || bugs.isError) return <NotFoundState />;
  const permissions = space.data.permissions;
  const canReport = permissions.includes(S.BUG_REPORT) && !space.data.archived;

  return (
    <ItemNavContext.Provider value={(key) => onSearch({ item: key })}>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={permissions.includes(S.SPACE_SETTINGS)}
      >
        {space.data.scrumEnabled && <ScrumTabs spaceId={spaceId} current="bugs" />}
      </ContainerHeader>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-red-600 dark:text-red-400">
            <BugIcon className="size-6" aria-hidden />
            {t('bugs.title')}
          </h2>
          {canReport && (
            <Button
              size="xl"
              variant="destructive"
              className="ml-auto font-semibold shadow-lg shadow-red-600/30"
              onClick={() => onSearch({ report: true })}
            >
              <Plus className="size-5" aria-hidden />
              {t('bugs.report')}
            </Button>
          )}
        </div>

        <div role="tablist" aria-label={t('bugs.filter')} className="mb-3 flex flex-wrap gap-1.5">
          {[undefined, ...BUG_STATUSES].map((status) => {
            const count = status ? all.filter((b) => b.bugStatus === status).length : all.length;
            const active = search.state === status;
            return (
              <button
                key={status ?? 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSearch({ state: status })}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
                  active ? 'border-primary bg-primary/10 text-primary font-semibold' : 'bg-card',
                )}
              >
                {status ? t(`bugStatus.${status}`) : t('bugs.all')}
                <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-14 text-center">
            <BugIcon className="size-8" aria-hidden />
            <p className="font-medium">{t('bugs.empty')}</p>
          </div>
        ) : (
          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wide uppercase">
                  <th className="px-3 py-2">{t('bugs.col.bug')}</th>
                  <th className="px-3 py-2">{t('bugs.col.severity')}</th>
                  <th className="px-3 py-2">{t('bugs.col.status')}</th>
                  <th className="px-3 py-2">{t('bugs.col.owner')}</th>
                  <th className="px-3 py-2">{t('bugs.col.assignee')}</th>
                  <th className="px-3 py-2">{t('bugs.col.created')}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t('bugs.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((bug) => (
                  <BugRow key={bug.id} bug={bug} spaceId={spaceId} permissions={permissions} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReportBugDialog
        spaceId={spaceId}
        open={!!search.report && canReport}
        onOpenChange={(open) => !open && onSearch({ report: undefined })}
      />
      <ItemPanel itemKey={search.item} />
    </ItemNavContext.Provider>
  );
}

function BugRow({
  bug,
  spaceId,
  permissions,
}: {
  bug: Bug;
  spaceId: string;
  permissions: readonly string[];
}) {
  const { t } = useTranslation();
  const { user } = useMe();
  const errorMessage = useErrorMessage();
  const members = useSpaceMembers(spaceId).data?.members ?? [];
  const assign = useAssignBug();
  const setStatus = useSetBugStatus();
  const canAssign = permissions.includes(S.BUG_ASSIGN);
  const canStatus =
    canAssign || permissions.includes(S.WORK_ITEM_WRITE) || bug.assignee?.id === user.id;
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const canMove = permissions.includes(S.WORK_ITEM_WRITE);
  const [moving, setMoving] = useState(false);

  return (
    <tr className="hover:bg-accent/40 border-b last:border-0">
      <td className="px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <BugIcon className="size-4 shrink-0 text-red-600" aria-hidden />
          <span className="text-muted-foreground font-mono text-xs">{bug.key}</span>
          <ItemOpenLink itemKey={bug.key} className="min-w-0 truncate font-medium hover:underline">
            {bug.title}
          </ItemOpenLink>
          {bug.fromEmail && (
            <span
              data-testid="bug-from-email"
              title={t('bugs.fromEmail', { name: bug.fromEmail.name, email: bug.fromEmail.email })}
              className="text-muted-foreground shrink-0"
            >
              <Mail className="size-3.5" aria-label={t('bugs.fromEmailShort')} />
            </span>
          )}
          {bug.convertedTo.length > 0 && (
            <span
              data-testid="bug-converted"
              className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-500/20 dark:text-violet-300"
            >
              {t('bugs.convertedTo', { keys: bug.convertedTo.join(', ') })}
            </span>
          )}
        </span>
      </td>
      <td
        className={cn('px-3 py-2 whitespace-nowrap', bug.severity && SEVERITY_STYLE[bug.severity])}
      >
        {bug.severity ? t(`severity.${bug.severity}`) : '—'}
      </td>
      <td className="px-3 py-2">
        {canStatus ? (
          <NativeSelect
            aria-label={t('bugs.statusFor', { key: bug.key })}
            value={bug.bugStatus}
            className={cn('h-8 border-0 font-medium', STATUS_STYLE[bug.bugStatus])}
            onChange={(e) =>
              setStatus.mutate(
                { itemId: bug.id, status: e.target.value as BugStatus },
                {
                  onSuccess: () => toast.success(t('bugs.statusChanged', { key: bug.key })),
                  onError,
                },
              )
            }
          >
            {BUG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`bugStatus.${s}`)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_STYLE[bug.bugStatus],
            )}
          >
            {t(`bugStatus.${bug.bugStatus}`)}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {bug.reporter ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <UserAvatar
              id={bug.reporter.id}
              name={bug.reporter.name}
              size={22}
              avatarVersion={bug.reporter.avatarVersion}
            />
            {bug.reporter.name}
          </span>
        ) : bug.fromEmail ? (
          <span className="text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
            <Mail className="size-3.5" aria-hidden />
            {bug.fromEmail.name}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2">
        {canAssign ? (
          <NativeSelect
            aria-label={t('bugs.assignFor', { key: bug.key })}
            value={bug.assignee?.id ?? ''}
            className="h-8 max-w-48"
            onChange={(e) =>
              assign.mutate(
                { itemId: bug.id, userId: e.target.value || null },
                {
                  onSuccess: () => toast.success(t('bugs.assigned', { key: bug.key })),
                  onError,
                },
              )
            }
          >
            <option value="">{t('bugs.unassigned')}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        ) : bug.assignee ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <UserAvatar
              id={bug.assignee.id}
              name={bug.assignee.name}
              size={22}
              avatarVersion={bug.assignee.avatarVersion}
            />
            {bug.assignee.name}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('bugs.unassigned')}</span>
        )}
      </td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
        {formatDate(bug.createdAt)}
      </td>
      <td className="px-3 py-2 text-right">
        {canMove && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              data-testid="bug-move"
              aria-label={t('bugs.move', { key: bug.key })}
              title={t('bugs.move', { key: bug.key })}
              onClick={() => setMoving(true)}
            >
              <FolderInput />
            </Button>
            <MoveItemDialog
              item={{ id: bug.id, key: bug.key, type: 'BUG', spaceId, childTaskIds: [] }}
              open={moving}
              onOpenChange={setMoving}
            />
          </>
        )}
      </td>
    </tr>
  );
}

function ReportBugDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel="×">
        {open && <ReportBugForm spaceId={spaceId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReportBugForm({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const report = useReportBug();
  const upload = useUploadAttachment();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('MAJOR');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [environment, setEnvironment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<unknown>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    const text = (value: string) => value.trim() || null;
    report.mutate(
      {
        spaceId,
        body: {
          title: title.trim(),
          severity,
          priority,
          stepsToReproduce: text(steps),
          expectedResult: text(expected),
          actualResult: text(actual),
          environment: text(environment),
        },
      },
      {
        onSuccess: ({ id, key }) => {
          void (async () => {
            for (const file of files) {
              try {
                await upload.mutateAsync({ itemId: id, file });
              } catch (uploadError) {
                toast.error(`${file.name}: ${errorMessage(uploadError)}`);
              }
            }
            toast.success(t('bugs.reported', { key }));
            onDone();
          })();
        },
        onError: setError,
      },
    );
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl text-red-600 dark:text-red-400">
          <BugIcon className="size-5" aria-hidden />
          {t('bugs.reportTitle')}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">{t('bugs.reportHint')}</p>
        <Field
          label={t('bugs.form.title')}
          value={title}
          maxLength={500}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('bugs.form.severity')}
            value={severity}
            onChange={(e) => setSeverity(e.target.value as BugSeverity)}
          >
            {BUG_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`severity.${s}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('bugs.form.priority')}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <TextArea label={t('bugs.form.steps')} value={steps} onChange={setSteps} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label={t('bugs.form.expected')} value={expected} onChange={setExpected} />
          <TextArea label={t('bugs.form.actual')} value={actual} onChange={setActual} />
        </div>
        <Field
          label={t('bugs.form.environment')}
          value={environment}
          maxLength={500}
          placeholder={t('bugs.form.environmentHint')}
          onChange={(e) => setEnvironment(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            data-testid="bug-files"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setFiles((prev) => [...prev, ...picked]);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip aria-hidden /> {t('bugs.form.attach')}
          </Button>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="bg-muted flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs"
                >
                  <span className="max-w-48 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={t('newMenu.removeFile', { name: file.name })}
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={report.isPending || upload.isPending || !title.trim()}
          variant="destructive"
        >
          <BugIcon aria-hidden /> {t('bugs.submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `bug-${label.replace(/\W+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} maxLength={5000} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
