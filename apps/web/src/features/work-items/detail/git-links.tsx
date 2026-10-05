import type { GitLink, WorkItemDetail } from '@scrum/shared';
import { GitCommitHorizontal, GitPullRequest } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const STATE_STYLE: Record<NonNullable<GitLink['state']>, string> = {
  OPEN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  MERGED: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
  CLOSED: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300',
};

/** İşe bağlı commit ve PR/MR'ler (brief §5.18, ADR-089). Bağlantı yoksa hiçbir şey çizilmez. */
export function GitLinks({ item }: { item: WorkItemDetail }) {
  const { t } = useTranslation();
  if (item.gitLinks.length === 0) return null;
  return (
    <section aria-label={t('gitLinks.title')} className="mt-4 border-t pt-3">
      <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
        {t('gitLinks.title')}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {item.gitLinks.map((link) => {
          const Icon = link.kind === 'COMMIT' ? GitCommitHorizontal : GitPullRequest;
          const label = `${link.kind === 'COMMIT' ? '' : '#'}${link.ref}`;
          return (
            <li key={link.id} className="flex items-start gap-2 text-sm">
              <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                {link.url ? (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {link.title}
                  </a>
                ) : (
                  link.title
                )}
                <span className="text-muted-foreground block truncate text-xs">
                  {link.repo} · <span className="font-mono">{label}</span>
                  {link.author && ` · ${link.author}`}
                </span>
              </span>
              {link.state && (
                <span
                  className={cn(
                    'rounded px-1.5 text-[11px] font-semibold',
                    STATE_STYLE[link.state],
                  )}
                >
                  {t(`gitLinks.state.${link.state}`)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
