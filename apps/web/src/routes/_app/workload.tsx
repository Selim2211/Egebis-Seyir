import { createFileRoute } from '@tanstack/react-router';
import { WorkloadPage } from '@/features/time/workload-page';

export const Route = createFileRoute('/_app/workload')({
  component: () => <WorkloadPage />,
});
