import { PRIORITIES, STATUS_CATEGORIES, WORK_ITEM_TYPES } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  PriorityIcon,
  StatusBadge,
  WorkItemTypeIcon,
} from '@/components/work-item/work-item-visuals';

export const Route = createFileRoute('/_app/design')({
  component: DesignSystemPage,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-3 text-sm font-medium">{title}</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-3 p-4">{children}</div>
    </section>
  );
}

function DesignSystemPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('design.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('design.subtitle')}</p>
      </div>

      <Section title={t('design.types')}>
        {WORK_ITEM_TYPES.map((type) => (
          <span key={type} className="inline-flex items-center gap-2 text-sm">
            <WorkItemTypeIcon type={type} />
            {t(`workItemType.${type}`)}
          </span>
        ))}
      </Section>

      <Section title={t('design.priorities')}>
        {PRIORITIES.map((p) => (
          <span key={p} className="inline-flex items-center gap-2 text-sm">
            <PriorityIcon priority={p} />
            {t(`priority.${p}`)}
          </span>
        ))}
      </Section>

      <Section title={t('design.statuses')}>
        {STATUS_CATEGORIES.map((c) => (
          <StatusBadge key={c} category={c} />
        ))}
      </Section>

      <Section title={t('design.buttons')}>
        <Button>{t('design.primary')}</Button>
        <Button variant="secondary">{t('design.secondary')}</Button>
        <Button variant="outline">{t('design.outline')}</Button>
        <Button variant="ghost">{t('design.ghost')}</Button>
        <Button variant="destructive">{t('design.destructive')}</Button>
      </Section>

      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-medium">{t('design.sample')}</h2>
        <div className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50">
          <WorkItemTypeIcon type="STORY" />
          <span className="font-mono text-xs text-muted-foreground">MOB-142</span>
          <span className="min-w-0 flex-1 truncate">{t('design.sampleTitle')}</span>
          <StatusBadge category="ACTIVE" />
          <PriorityIcon priority="HIGH" />
          <span className="w-6 rounded bg-muted text-center text-xs font-medium tabular-nums">
            5
          </span>
        </div>
      </section>
    </div>
  );
}
