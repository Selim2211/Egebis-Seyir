import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { meQuery } from '@/features/auth/queries';

/** /settings → üyeleri görebiliyorsa Üyeler, aksi halde Profil. */
export const Route = createFileRoute('/_app/settings/')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    const canViewMembers = me.workspaces.some((w) =>
      w.permissions.includes(WORKSPACE_PERMISSIONS.MEMBERS_VIEW),
    );
    throw redirect({
      to: canViewMembers ? '/settings/members' : '/settings/profile',
      replace: true,
    });
  },
});
