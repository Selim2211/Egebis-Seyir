import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, CircleDashed } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/')({
  component: HomePage,
});

const NEXT_STEPS = ['home.next1', 'home.next2', 'home.next3', 'home.next4'] as const;

function HomePage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('home.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('home.subtitle')}</p>

      <section className="mt-8 rounded-lg border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-medium">{t('home.nextTitle')}</h2>
        <ul className="divide-y">
          {NEXT_STEPS.map((key) => (
            <li key={key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <CircleDashed className="size-4 text-status-not-started" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <Link
        to="/design"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {t('home.designLink')}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
