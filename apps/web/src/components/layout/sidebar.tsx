import { Link } from '@tanstack/react-router';
import {
  FileText,
  House,
  Inbox,
  Layers,
  ListTodo,
  Palette,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

const navItemClass =
  'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

function NavLink({
  to,
  icon: Icon,
  label,
}: {
  to: '/' | '/design';
  icon: LucideIcon;
  label: string;
}) {
  const close = useUiStore((s) => s.setSidebarOpen);
  return (
    <Link
      to={to}
      onClick={() => close(false)}
      className={navItemClass}
      activeProps={{ className: 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' }}
      activeOptions={{ exact: true }}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

/** Henüz hazır olmayan menü öğesi (Faz 1). */
function PlannedItem({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(navItemClass, 'cursor-not-allowed opacity-50 hover:bg-transparent')}>
          <Icon className="size-4" aria-hidden />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{t('nav.comingSoon')}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarOpen, setSidebarOpen } = useUiStore();

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
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar max-md:transition-transform md:static md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label={t('app.name')}
      >
        <div className="flex h-12 items-center gap-2 border-b border-sidebar-border px-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            S
          </div>
          <span className="truncate text-sm font-semibold">{t('app.name')}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-7 md:hidden"
            aria-label={t('nav.closeMenu')}
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <NavLink to="/" icon={House} label={t('nav.home')} />
          <PlannedItem icon={ListTodo} label={t('nav.myWork')} />
          <PlannedItem icon={Inbox} label={t('nav.inbox')} />
          <PlannedItem icon={FileText} label={t('nav.docs')} />

          <div className="mt-4 mb-1 flex items-center justify-between px-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t('nav.spaces')}
            </span>
          </div>
          <div className="mx-1 rounded-md border border-dashed border-sidebar-border p-3 text-center">
            <Layers className="mx-auto mb-1.5 size-5 text-muted-foreground" aria-hidden />
            <p className="text-xs font-medium">{t('spaces.emptyTitle')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('spaces.emptyBody')}</p>
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

        <div className="border-t border-sidebar-border p-2">
          <NavLink to="/design" icon={Palette} label={t('nav.designSystem')} />
        </div>
      </aside>
    </>
  );
}
