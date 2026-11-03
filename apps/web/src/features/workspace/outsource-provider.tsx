import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { type ReactNode, useMemo } from 'react';
import { OutsourceIdsProvider } from '@/components/outsource-context';
import { useCan, useMembers } from './queries';

/** Üye listesini görebilenler için dış kaynak kişileri işaretler (ADR-152). */
export function OutsourceProvider({ children }: { children: ReactNode }) {
  const canView = useCan(WORKSPACE_PERMISSIONS.MEMBERS_VIEW);
  const members = useMembers(canView);
  const ids = useMemo(
    () => members.data?.members.filter((m) => m.tier === 'GUEST').map((m) => m.userId) ?? [],
    [members.data],
  );
  return <OutsourceIdsProvider ids={ids}>{children}</OutsourceIdsProvider>;
}
