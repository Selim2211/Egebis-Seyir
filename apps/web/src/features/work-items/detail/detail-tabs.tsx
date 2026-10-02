import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ActivityList } from './activity-list';
import { Comments } from './comments';

/** Detayın altındaki Yorumlar / Aktivite sekmeleri (brief §5.13). */
export function DetailTabs({
  itemId,
  commentCount,
  canComment,
}: {
  itemId: string;
  commentCount: number;
  canComment: boolean;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  return (
    <section>
      <div role="tablist" aria-label={t('comments.title')} className="mb-3 flex gap-1 border-b">
        {(['comments', 'activity'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px flex h-9 items-center gap-1.5 border-b-2 px-3 text-sm',
              tab === key
                ? 'border-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t(key === 'comments' ? 'comments.title' : 'activity.title')}
            {key === 'comments' && commentCount > 0 && (
              <span className="text-muted-foreground text-xs font-normal">{commentCount}</span>
            )}
          </button>
        ))}
      </div>
      {tab === 'comments' ? (
        <Comments itemId={itemId} canComment={canComment} />
      ) : (
        <ActivityList itemId={itemId} />
      )}
    </section>
  );
}
