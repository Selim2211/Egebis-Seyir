import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { Link, type LinkProps } from '@tanstack/react-router';
import {
  FileText,
  House,
  Inbox,
  Layers,
  ListTodo,
  Palette,
  Plus,
  Settings2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

const navItemClass =
  'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

function NavLink({
  to,
  icon: Icon,
  label,
  exact = true,
}: {
  to: LinkProps['to'];
  icon: LucideIcon;
  label: string;
  exact?: boolean;
}) {
  const close = useUiStore((s) => s.setSidebarOpen);
  return (
    <Link
      to={to}
      onClick={() => close(false)}
      className={navItemClass}
      activeProps={{ className: 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' }}
      activeOptions={{ exact }}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

/** Henüz hazır olmayan menü öğesi; hangi fazda geleceği etiketle görünür. */
function PlannedItem({
  icon: Icon,
  label,
  phase,
}: {
  icon: LucideIcon;
  label: string;
  phase?: string;
}) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(navItemClass, 'cursor-not-allowed opacity-60 hover:bg-transparent')}>
          <Icon className="size-4" aria-hidden />
          <span className="flex-1">{label}</span>
          {phase && (
            <span className="text-muted-foreground rounded border px-1 text-[10px] leading-4 font-semibold">
              {phase}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{t('nav.comingSoon')}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const workspace = useCurrentWorkspace();
  const canManageMembers = useCan(WORKSPACE_PERMISSIONS.MEMBERS_MANAGE);

  return (
    <>
      {/* Mobil: arka plan örtüsü */}
      <div
        className={cn('fixed inset-0 z-40 bg-black/40 md:hidden', !sidebarOpen && 'hidden')}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          'border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-50 flex w-62 flex-col border-r max-md:transition-transform md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label={t('app.name')}
      >
        <div className="border-sidebar-border flex h-12 items-center gap-2 border-b px-3">
          <div className="bg-primary text-primary-foreground flex size-6.5 shrink-0 items-center justify-center rounded-md text-xs font-bold">
            {workspace.name.slice(0, 1).toLocaleUpperCase('tr')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{workspace.name}</p>
            <p className="text-muted-foreground text-[11px]">{t('nav.workspace')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 md:hidden"
            aria-label={t('nav.closeMenu')}
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <NavLink to="/" icon={House} label={t('nav.home')} />
          <PlannedItem icon={ListTodo} label={t('nav.myWork')} />
          <PlannedItem icon={Inbox} label={t('nav.inbox')} phase="F2" />
          <PlannedItem icon={FileText} label={t('nav.docs')} phase="F3" />

          <div className="mt-4 mb-1 px-2">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
              {t('nav.spaces')}
            </span>
          </div>
          <div className="border-sidebar-border mx-1 rounded-md border border-dashed p-3 text-center">
            <Layers className="text-muted-foreground mx-auto mb-1.5 size-5" aria-hidden />
            <p className="text-xs font-medium">{t('spaces.emptyTitle')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{t('spaces.emptyBody')}</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="mt-2 inline-block">
                  <Button size="sm" variant="secondary" disabled>
                    <Plus />
                    {t('spaces.create')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">{t('nav.comingSoon')}</TooltipContent>
            </Tooltip>
          </div>
        </nav>

        <div className="border-sidebar-border flex flex-col gap-0.5 border-t p-2">
          {canManageMembers && (
            <NavLink to="/settings/members" icon={UserPlus} label={t('nav.inviteMembers')} />
          )}
          <NavLink to="/settings" icon={Settings2} label={t('nav.settings')} exact={false} />
          {import.meta.env.DEV && (
            <NavLink to="/design" icon={Palette} label={t('nav.designSystem')} />
          )}
        </div>
      </aside>
    </>
  );
}
