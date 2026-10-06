import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { MessagesPage } from '@/features/messages/messages-page';

export const Route = createFileRoute('/_app/messages')({
  validateSearch: z.object({ c: z.uuid().optional() }),
  component: MessagesRoute,
});

function MessagesRoute() {
  const { c } = Route.useSearch();
  return <MessagesPage conversationId={c ?? null} />;
}
