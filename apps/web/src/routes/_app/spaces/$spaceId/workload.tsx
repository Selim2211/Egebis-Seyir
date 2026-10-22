import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { LoadingState } from '@/features/spaces/container-header';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useUiStore } from '@/lib/ui-store';

export const Route = createFileRoute('/_app/spaces/$spaceId/workload')({
  component: ProjectWorkloadRoute,
});

/** Proje menüsündeki "İş yükü": o Proje seçilir (hatırlanır) ve genel İş yükü sayfası açılır (ADR-132). */
function ProjectWorkloadRoute() {
  const { spaceId } = Route.useParams();
  const navigate = useNavigate();
  const { id: workspaceId } = useCurrentWorkspace();
  const setWorkloadSpace = useUiStore((s) => s.setWorkloadSpace);
  useEffect(() => {
    setWorkloadSpace(workspaceId, spaceId);
    void navigate({ to: '/workload', replace: true });
  }, [spaceId, workspaceId, setWorkloadSpace, navigate]);
  return <LoadingState />;
}
