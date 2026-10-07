import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { Link, type LinkProps } from '@tanstack/react-router';
import {
  House,
  Inbox,
  ListTodo,
  MessageSquare,
  Palette,
  Target,
  Settings2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useConversations } from '@/features/messages/queries';
import { useUnreadCount } from '@/features/notifications/queries';
import { SidebarTree } from '@/features/spaces/sidebar-tree';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

const navItemClass =
  'group/nav relative flex h-8.5 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

function NavLink({
  to,
  icon: Icon,
  label,
  exact = true,
  badge = 0,
}: {
  to: LinkProps['to'];
  icon: LucideIcon;
  label: string;
  exact?: boolean;
  /** Okunmamış sayısı gibi küçük sayaç; 0 ise görünmez. */
  badge?: number;
}) {
  const close = useUiStore((s) => s.setSidebarOpen);
  return (
    <Link
      to={to}
      onClick={() => close(false)}
      className={navItemClass}
      activeProps={{
        className:
          'bg-primary/10 !text-primary font-semibold before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary dark:bg-primary/15',
      }}
      activeOptions={{ exact }}
    >
      <Icon
        className="size-4 transition-transform duration-200 group-hover/nav:scale-110"
        aria-hidden
      />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span
          aria-label={`${badge}`}
          className="bg-brand animate-in zoom-in-50 rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums shadow-sm"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const unread = useUnreadCount();
  const { t } = useTranslation();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const workspace = useCurrentWorkspace();
  const canManageMembers = useCan(WORKSPACE_PERMISSIONS.MEMBERS_MANAGE);
  // Misafirler mesajlaşamaz (ADR-098); onlar için yoklama da yapılmaz.
  const canMessage = workspace.role !== 'GUEST';
  const unreadMessages = useConversations(canMessage).data?.unreadCount ?? 0;

  return (
    <>
      {/* Mobil: arka plan örtüsü */}
      <div
        className={cn(
          'animate-in fade-in fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden',
          !sidebarOpen && 'hidden',
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          'border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-50 flex w-62 flex-col border-r max-md:transition-transform max-md:duration-300 max-md:ease-[var(--ease-out)] md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label={t('app.name')}
      >
        <div className="flex h-15 shrink-0 items-center px-4">
          <BrandMark size={32} />
        </div>
        <div className="border-sidebar-border flex h-12 items-center gap-2 border-y px-3">
          <div className="bg-brand flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm">
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
          <NavLink to="/my-work" icon={ListTodo} label={t('nav.myWork')} />
          <NavLink to="/goals" icon={Target} label={t('nav.goals')} />
          {canMessage && (
            <NavLink
              to="/messages"
              icon={MessageSquare}
              label={t('nav.messages')}
              badge={unreadMessages}
            />
          )}
          <NavLink to="/notifications" icon={Inbox} label={t('nav.inbox')} badge={unread} />

          <SidebarTree />
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
