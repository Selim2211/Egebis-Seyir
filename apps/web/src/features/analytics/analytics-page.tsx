import {
  ANALYTICS_COMPARE_MAX,
  WORKSPACE_PERMISSIONS,
  type AnalyticsGrain,
  type AnalyticsMetric,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/features/auth/queries';
import { useHierarchy } from '@/features/spaces/queries';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate, todayDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CapacityView } from './capacity-view';
import { CompareView } from './compare-view';
import { ExportBar } from './export-bar';
import { FlowView } from './flow-view';
import { ForecastView } from './forecast-view';
import { addDays, Empty, FilterBar } from './parts';
import { PersonView } from './person-view';
import { ProjectView } from './project-view';
import { QualityView } from './quality-view';
import { SprintView } from './sprint-view';
import {
  capacityQuery,
  compareQuery,
  flowQuery,
  forecastQuery,
  sprintBurndownQuery,
  sprintsQuery,
  peopleQuery,
  personQuery,
  projectQuery,
  qualityQuery,
  type AnalyticsFilters,
} from './queries';

/** Seçilebilecek en uzun aralık (gün); API 731 günü aşanı reddeder. */
const MAX_RANGE_DAYS = 730;

export type AnalyticsTab =
  'person' | 'project' | 'flow' | 'sprint' | 'capacity' | 'quality' | 'forecast' | 'compare';

/** Adres çubuğundaki durum (hepsi isteğe bağlı; eksikler varsayılanla tamamlanır). */
export interface AnalyticsSearch {
  av?: AnalyticsTab | undefined;
  ap?: string | undefined;
  aj?: string | undefined;
  af?: string | undefined;
  at?: string | undefined;
  ag?: AnalyticsGrain | undefined;
  am?: AnalyticsMetric | undefined;
  ac?: string | undefined;
  asp?: string | undefined;
  /** Sprint sekmesinde seçili sprint. */
  asr?: string | undefined;
  /** Kapasite sekmesi: haftalık çalışma saati ve ısı haritası için seçili kişi. */
  awh?: number | undefined;
  acf?: string | undefined;
}

/** Kişi ve Proje analizi (ADR-143): kişi, Proje ve karşılaştırma sekmeleri. */
export function AnalyticsPage({
  search,
  onSearch,
}: {
  search: AnalyticsSearch;
  onSearch: (patch: AnalyticsSearch) => void;
}) {
  const { t } = useTranslation();
  const { id: ws } = useCurrentWorkspace();
  const me = useMe();
  const admin = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  const hierarchy = useHierarchy();

  const today = todayDay();
  const filters: AnalyticsFilters = {
    from: search.af ?? addDays(today, -89),
    to: search.at ?? today,
    grain: search.ag ?? 'week',
    spaceId: search.asp,
  };
  const metric: AnalyticsMetric = search.am ?? 'points';
  // Üye yalnızca kendi kişi analizini görür.
  const tab: AnalyticsTab = admin ? (search.av ?? 'person') : 'person';

  // Kişi listesi yalnızca kişi seçicisi ve karşılaştırma için gerekir.
  const people = useQuery({
    ...peopleQuery(ws, filters),
    enabled: admin && (tab === 'person' || tab === 'compare'),
  });
  const userId = admin ? (search.ap ?? me.user.id) : me.user.id;
  const spaceId = search.aj ?? hierarchy.data?.spaces[0]?.id;
  const selected = (search.ac ?? '').split(',').filter(Boolean).slice(0, ANALYTICS_COMPARE_MAX);

  const person = useQuery({ ...personQuery(ws, userId, filters), enabled: tab === 'person' });
  const project = useQuery({
    ...projectQuery(ws, spaceId ?? '', filters),
    enabled: admin && tab === 'project' && !!spaceId,
  });
  const flow = useQuery({ ...flowQuery(ws, filters), enabled: admin && tab === 'flow' });
  const sprints = useQuery({ ...sprintsQuery(ws, filters), enabled: admin && tab === 'sprint' });
  const sprintList = sprints.data?.sprints ?? [];
  // Varsayılan: taahhüdü olan en yeni sprint (yoksa en yenisi).
  const latestWithData = [...sprintList].reverse().find((s) => s.committed > 0);
  const selectedSprint =
    search.asr ?? latestWithData?.id ?? sprintList[sprintList.length - 1]?.id ?? '';
  const burndown = useQuery({
    ...sprintBurndownQuery(ws, selectedSprint),
    enabled: admin && tab === 'sprint' && selectedSprint !== '',
  });
  const weeklyHours = search.awh ?? 40;
  const capacity = useQuery({
    ...capacityQuery(ws, filters, weeklyHours),
    enabled: admin && tab === 'capacity',
  });
  const quality = useQuery({ ...qualityQuery(ws, filters), enabled: admin && tab === 'quality' });
  const forecast = useQuery({ ...forecastQuery(ws), enabled: admin && tab === 'forecast' });
  const compare = useQuery({
    ...compareQuery(ws, selected, filters),
    enabled: admin && tab === 'compare' && selected.length >= 2,
  });

  const setFilters = (patch: Partial<AnalyticsFilters>) => {
    // Aralık her zaman geçerli kalır: ters seçim düzeltilir, en çok 2 yıl (API sınırı 731 gün).
    let from = patch.from ?? filters.from;
    let to = patch.to ?? filters.to;
    if (from > to) [from, to] = 'from' in patch ? [from, from] : [to, to];
    if (from < addDays(to, -(MAX_RANGE_DAYS - 1))) {
      if ('from' in patch) to = addDays(from, MAX_RANGE_DAYS - 1);
      else from = addDays(to, -(MAX_RANGE_DAYS - 1));
    }
    onSearch({
      ...('from' in patch || 'to' in patch ? { af: from, at: to } : {}),
      ...('grain' in patch ? { ag: patch.grain } : {}),
      ...('spaceId' in patch ? { asp: patch.spaceId } : {}),
    });
  };

  const tabs: AnalyticsTab[] = admin
    ? ['person', 'project', 'flow', 'sprint', 'capacity', 'quality', 'forecast', 'compare']
    : ['person'];
  const peopleList = people.data?.people ?? [];

  return (
    <div className="doc-print mx-auto max-w-7xl px-4 py-6 sm:px-6" data-testid="analytics-page">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-[22px] font-semibold tracking-tight">{t('analytics.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {admin ? t('analytics.subtitle') : t('analytics.subtitleSelf')}
          </p>
          <p className="text-muted-foreground hidden text-xs print:block">
            {formatShortDate(filters.from)} – {formatShortDate(filters.to)}
          </p>
        </div>
        <ExportBar
          view={tab}
          filters={filters}
          admin={admin}
          userId={userId}
          projectId={spaceId}
          userIds={selected}
          weeklyHours={weeklyHours}
        />
      </div>

      {admin && (
        <div
          className="mb-4 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b print:hidden"
          role="tablist"
          aria-label={t('analytics.tabs')}
        >
          {tabs.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={tab === x}
              data-testid={`tab-${x}`}
              onClick={(e) => {
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                onSearch({ av: x });
              }}
              className={cn(
                'focus-visible:ring-ring/60 shrink-0 cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset',
                tab === x
                  ? 'border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {t(`analytics.tab.${x}`)}
            </button>
          ))}
        </div>
      )}

      <div className="mb-5 print:hidden">
        <FilterBar filters={filters} onChange={setFilters} showProject={tab !== 'project'} />
      </div>

      {tab === 'person' &&
        (person.data ? (
          <PersonView
            data={person.data}
            people={admin ? peopleList : null}
            onUser={(id) => onSearch({ ap: id })}
            metric={metric}
            onMetric={(m) => onSearch({ am: m })}
          />
        ) : (
          <Empty text={person.isError ? t('analytics.loadFailed') : t('common.loading')} />
        ))}

      {tab === 'project' &&
        (project.data ? (
          <ProjectView
            data={project.data}
            onSpace={(id) => onSearch({ aj: id })}
            onPerson={(id) => onSearch({ av: 'person', ap: id })}
            metric={metric}
            onMetric={(m) => onSearch({ am: m })}
          />
        ) : (
          <Empty
            text={
              project.isError
                ? t('analytics.loadFailed')
                : spaceId
                  ? t('common.loading')
                  : t('analytics.noProjects')
            }
          />
        ))}

      {tab === 'flow' &&
        (flow.data ? (
          <FlowView data={flow.data} />
        ) : (
          <Empty text={flow.isError ? t('analytics.loadFailed') : t('common.loading')} />
        ))}

      {tab === 'sprint' &&
        (sprints.data ? (
          <SprintView
            data={sprints.data}
            selected={selectedSprint}
            onSelect={(id) => onSearch({ asr: id })}
            burndown={burndown.data}
          />
        ) : (
          <Empty text={sprints.isError ? t('analytics.loadFailed') : t('common.loading')} />
        ))}

      {tab === 'capacity' &&
        (capacity.data ? (
          <CapacityView
            data={capacity.data}
            weeklyHours={weeklyHours}
            onWeeklyHours={(h) => onSearch({ awh: h })}
            focus={search.acf}
            onFocus={(id) => onSearch({ acf: id })}
          />
        ) : (
          <Empty text={capacity.isError ? t('analytics.loadFailed') : t('common.loading')} />
        ))}

      {tab === 'quality' &&
        (quality.data ? (
          <QualityView data={quality.data} />
        ) : (
          <Empty text={quality.isError ? t('analytics.loadFailed') : t('common.loading')} />
        ))}

      {tab === 'forecast' &&
        (forecast.data ? (
          <ForecastView data={forecast.data} />
        ) : (
          <Empty text={forecast.isError ? t('analytics.loadFailed') : t('common.loading')} />
        ))}

      {tab === 'compare' && (
        <CompareView
          data={compare.data}
          people={peopleList}
          selected={selected}
          onSelected={(ids) => onSearch({ ac: ids.join(',') || undefined })}
          metric={metric}
          onMetric={(m) => onSearch({ am: m })}
        />
      )}
    </div>
  );
}
