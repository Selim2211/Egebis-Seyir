import {
  moveWidget,
  SPACE_PERMISSIONS as S,
  type DashboardWidget,
  type WidgetId,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { downloadCsv } from '@/lib/download';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { dashboardQuery, flowQuery, useSaveDashboard } from './queries';
import { WidgetBody } from './widgets';

const RANGES = [30, 60, 90] as const;

/** Pano (brief §5.11, ADR-078): widget'ları ekle/çıkar, boyutlandır, sırala; düzen kullanıcıya özeldir. */
export function DashboardPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const [days, setDays] = useState<number>(30);
  const [customizing, setCustomizing] = useState(false);
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const layout = useQuery(dashboardQuery(workspaceId, spaceId));
  const flow = useQuery(flowQuery(workspaceId, spaceId, days));
  const save = useSaveDashboard(spaceId);

  if (space.isPending || layout.isPending) return <LoadingState />;
  if (space.isError || layout.isError) return <NotFoundState />;

  const widgets = layout.data.widgets;
  const visible = widgets.filter((w) => w.visible);
  const hidden = widgets.filter((w) => !w.visible);
  const update = (next: DashboardWidget[]) =>
    save.mutate({ widgets: next }, { onError: (error) => toast.error(errorMessage(error)) });
  const patch = (id: WidgetId, change: Partial<DashboardWidget>) =>
    update(widgets.map((w) => (w.id === id ? { ...w, ...change } : w)));

  const exportFlow = () => {
    if (!flow.data) return;
    const { cfd, throughput } = flow.data;
    downloadCsv(`akis-${flow.data.from}_${flow.data.to}.csv`, [
      [
        t('dashboard.csv.date'),
        t('dashboard.cat.NOT_STARTED'),
        t('dashboard.cat.ACTIVE'),
        t('dashboard.cat.DONE'),
      ],
      ...cfd.days.map((d, i) => [d, cfd.notStarted[i], cfd.active[i], cfd.done[i]]),
      [],
      [t('dashboard.csv.week'), t('dashboard.completed')],
      ...throughput.map((w) => [w.weekStart, w.count]),
    ]);
  };

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{t('dashboard.title')}</h1>
          <NativeSelect
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label={t('dashboard.range')}
            className="ml-auto h-8"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {t('dashboard.lastDays', { count: r })}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" size="sm" disabled={!flow.data} onClick={exportFlow}>
            <Download /> {t('dashboard.exportCsv')}
          </Button>
          <Button
            variant={customizing ? 'default' : 'outline'}
            size="sm"
            aria-pressed={customizing}
            onClick={() => setCustomizing(!customizing)}
          >
            <Settings2 /> {t('dashboard.customize')}
          </Button>
        </div>

        {customizing && hidden.length > 0 && (
          <section
            aria-label={t('dashboard.hiddenWidgets')}
            className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-3"
          >
            <span className="text-sm font-medium">{t('dashboard.hiddenWidgets')}</span>
            {hidden.map((w) => (
              <Button
                key={w.id}
                size="sm"
                variant="outline"
                onClick={() => patch(w.id, { visible: true })}
              >
                <Eye /> {t(`dashboard.widget.${w.id}`)}
              </Button>
            ))}
          </section>
        )}

        {visible.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('dashboard.allHidden')}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((widget, index) => (
              <section
                key={widget.id}
                aria-labelledby={`w-${widget.id}`}
                data-widget={widget.id}
                className={cn(
                  'bg-card min-w-0 rounded-lg border p-4',
                  widget.size === 'L' && 'md:col-span-2',
                )}
              >
                <div className="mb-3 flex items-center gap-1">
                  <h2 id={`w-${widget.id}`} className="flex-1 text-base font-semibold">
                    {t(`dashboard.widget.${widget.id}`)}
                  </h2>
                  {customizing && (
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === 0}
                        aria-label={t('dashboard.moveUp', {
                          name: t(`dashboard.widget.${widget.id}`),
                        })}
                        onClick={() => update(moveWidget(widgets, widget.id, -1))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === visible.length - 1}
                        aria-label={t('dashboard.moveDown', {
                          name: t(`dashboard.widget.${widget.id}`),
                        })}
                        onClick={() => update(moveWidget(widgets, widget.id, 1))}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t(widget.size === 'L' ? 'dashboard.shrink' : 'dashboard.grow', {
                          name: t(`dashboard.widget.${widget.id}`),
                        })}
                        onClick={() => patch(widget.id, { size: widget.size === 'L' ? 'M' : 'L' })}
                      >
                        {widget.size === 'L' ? <Minimize2 /> : <Maximize2 />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={t('dashboard.hide', {
                          name: t(`dashboard.widget.${widget.id}`),
                        })}
                        onClick={() => patch(widget.id, { visible: false })}
                      >
                        <EyeOff />
                      </Button>
                    </div>
                  )}
                </div>
                <WidgetBody
                  id={widget.id}
                  spaceId={spaceId}
                  flow={flow.data}
                  scrum={space.data.scrumEnabled}
                />
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
