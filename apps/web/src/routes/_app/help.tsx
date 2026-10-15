import { createFileRoute } from '@tanstack/react-router';
import { HelpPage } from '@/features/help/help-page';

export const Route = createFileRoute('/_app/help')({
  validateSearch: (search: Record<string, unknown>): { section?: string } =>
    typeof search.section === 'string' ? { section: search.section } : {},
  component: HelpRoute,
});

/** Yardım ve kullanıcı kılavuzu (/help, ör. /help?section=sprint-create). */
function HelpRoute() {
  const { section } = Route.useSearch();
  return <HelpPage section={section} />;
}
