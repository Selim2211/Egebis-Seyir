import { useMe } from '@/features/auth/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';

/** Sprint silme ve askıya alma: yalnızca Super Admin ve Projenin Scrum Master'ı. */
export function useSprintAdmin(scrumMasterId: string | null | undefined): boolean {
  const { user } = useMe();
  const { role } = useCurrentWorkspace();
  return role === 'OWNER' || role === 'ADMIN' || (!!scrumMasterId && scrumMasterId === user.id);
}
