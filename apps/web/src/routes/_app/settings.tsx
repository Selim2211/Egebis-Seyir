import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { createFileRoute, Link, type LinkProps, Outlet } from '@tanstack/react-router';
import {
  Archive,
  Building2,
  MonitorSmartphone,
  Settings2,
  UserRound,
  Users,
  type LucideIcon,
  Bell,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/workspace/queries';

/** Ayarlar düzeni: sol alt menü (taslak: "6 · Workspace üyeleri ve davet"). */
export const Route = createFileRoute('/_app/settings')({
  component: SettingsLayout,
});

function SubLink({
  to,
  icon: Icon,
  label,
}: {
  to: LinkProps['to'];
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap"
      activeProps={{ className: 'bg-accent !text-foreground font-medium' }}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-muted-foreground hidden px-2 text-[11px] font-semibold tracking-wide uppercase lg:mt-4 lg:mb-1 lg:block lg:first:mt-0">
      {children}
    </p>
  );
}

function SettingsLayout() {
  const { t } = useTranslation();
  const canViewMembers = useCan(WORKSPACE_PERMISSIONS.MEMBERS_VIEW);
  const canEditWorkspace = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <nav
        aria-label={t('settings.title')}
        className="flex gap-1 overflow-x-auto border-b p-3 lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0 lg:p-4"
      >
        <SectionLabel>{t('settings.workspaceSection')}</SectionLabel>
        {canEditWorkspace && (
          <SubLink to="/settings/general" icon={Building2} label={t('settings.general')} />
        )}
        {canViewMembers && (
          <SubLink to="/settings/members" icon={Users} label={t('settings.members')} />
        )}
        <SubLink to="/settings/archive" icon={Archive} label={t('settings.archive')} />
        <SectionLabel>{t('settings.accountSection')}</SectionLabel>
        <SubLink to="/settings/profile" icon={UserRound} label={t('settings.profile')} />
        <SubLink to="/settings/preferences" icon={Settings2} label={t('settings.preferences')} />
        <SubLink to="/settings/notifications" icon={Bell} label={t('settings.notifications')} />
        <SubLink to="/settings/sessions" icon={MonitorSmartphone} label={t('settings.sessions')} />
      </nav>
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="max-w-4xl">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
