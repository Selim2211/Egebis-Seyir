import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, CircleDashed, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useMe } from '@/features/auth/queries';
import { useCan } from '@/features/workspace/queries';

export const Route = createFileRoute('/_app/')({
  component: HomePage,
});

const NEXT_STEPS = ['home.next1', 'home.next2', 'home.next3', 'home.next4'] as const;

function HomePage() {
  const { t } = useTranslation();
  const { user } = useMe();
  const canInvite = useCan(WORKSPACE_PERMISSIONS.MEMBERS_MANAGE);
  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('home.greeting', { name: firstName })}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">{t('home.subtitle')}</p>

      {canInvite && (
        <Button asChild className="mt-5">
          <Link to="/settings/members">
            <UserPlus />
            {t('home.inviteCta')}
          </Link>
        </Button>
      )}

      <section className="bg-card mt-8 rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">{t('home.nextTitle')}</h2>
        <ul className="divide-y">
          {NEXT_STEPS.map((key) => (
            <li key={key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <CircleDashed className="text-status-not-started size-4" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      {import.meta.env.DEV && (
        <Link
          to="/design"
          className="text-primary mt-6 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          {t('home.designLink')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
