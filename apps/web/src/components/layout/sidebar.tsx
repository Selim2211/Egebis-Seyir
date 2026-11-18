import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { Link, type LinkProps } from '@tanstack/react-router';
import {
  Bug,
  ChevronsLeft,
  Gauge,
  House,
  Inbox,
  ListTodo,
  MessageSquare,
  Palette,
  Target,
  Users,
  Settings2,
  X,
  type LucideIcon,
  ChartColumn,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useConversations } from '@/features/messages/queries';
import { useUnreadCount } from '@/features/notifications/queries';
import { SpaceAvatar } from '@/features/spaces/space-avatar';
import { useHierarchy } from '@/features/spaces/queries';
import { SectionTitle, SidebarTree } from '@/features/spaces/sidebar-tree';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

/**
 * Sol menü — akıcılık odaklı (ADR-174). Masaüstünde iki hâl vardır:
 *  - Sabit açık (248 px): içerik menünün yanında başlar.
 *  - Daralmış (66 px, yalnızca ikonlar): fare üstüne gelince 70 ms sonra GEÇİCİ genişler ve içeriğin
 *    ÜSTÜNE biner; içerik hiç oynamaz. Ok düğmesi menüyü açık hâlde sabitler/daraltır (tercih kalıcı).
 *
 * Akıcılık kuralları:
 *  1. Menü `position: fixed`; içeriğin soldaki boşluğu yalnızca sabitleme değişince değişir (AppShell).
 *  2. İçeriğin kaymasına geçiş yok; yalnızca menünün kendisi animasyonlanır.
 *  3. Menü izole: `contain: layout paint style; will-change: width`.
 *  4. İkonlar yerinde durur: sabit sol dolgu, `flex: 0 0 auto`; daralınca hareket etmez.
 *  5. Yazılar yeniden akmaz: `nowrap`, `overflow: hidden`; gizlenmez, yalnızca `opacity: 0` +
 *     `translateX(-8px)` olur.
 *  6. Yalnızca `transform`, `opacity` ve menünün `width`'i animasyonlanır; 170 ms, tek eğri.
 *
 * Mobilde (< md) eski çekmece davranışı sürer.
 */
const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
/** Yazı/etiket: daralınca soluk ve 8 px sola; DOM'da kalır, boyutu değişmez (kural 5). */
const LABEL = cn(
  'whitespace-nowrap will-change-[opacity] transition-[opacity,transform] duration-[170ms] motion-reduce:transition-none',
  EASE,
  'md:group-data-[rail=true]/side:pointer-events-none md:group-data-[rail=true]/side:-translate-x-2 md:group-data-[rail=true]/side:opacity-0',
);

const navItemClass =
  'group/nav relative flex h-8.5 items-center gap-2.5 rounded-lg pr-2.5 pl-[17px] text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

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
      <Icon className="size-4 flex-none" aria-hidden />
      <span className={cn('flex-1', LABEL)}>{label}</span>
      {badge > 0 && (
        <>
          <span
            aria-label={`${badge}`}
            className={cn(
              'bg-brand rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums shadow-sm',
              LABEL,
            )}
          >
            {badge > 99 ? '99+' : badge}
          </span>
          {/* Daralmışken sayaç yerine ikonun köşesinde küçük bir nokta. */}
          <span
            aria-hidden
            className={cn(
              'bg-brand ring-sidebar absolute top-1.5 left-[29px] size-2 rounded-full ring-2 max-md:hidden',
              'opacity-0 transition-opacity duration-[170ms] md:group-data-[rail=true]/side:opacity-100',
            )}
          />
        </>
      )}
    </Link>
  );
}

/** Daralmış menüde Projeler: yalnızca renkli ikonlar (genişleyince tam ağaç görünür). */
function RailProjects() {
  const { data } = useHierarchy();
  const spaces = data?.spaces ?? [];
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 opacity-0 max-md:hidden',
        'transition-opacity duration-[170ms] motion-reduce:transition-none md:group-data-[rail=true]/side:pointer-events-auto md:group-data-[rail=true]/side:opacity-100',
      )}
    >
      <div className="border-sidebar-border mx-3 mt-2 mb-3 border-t" />
      <ul className="flex flex-col items-center gap-1.5">
        {spaces.map((space) => (
          <li key={space.id}>
            <Link
              to="/spaces/$spaceId"
              params={{ spaceId: space.id }}
              tabIndex={-1}
              title={space.name}
              aria-label={space.name}
              className="hover:bg-sidebar-accent flex size-9 items-center justify-center rounded-lg"
              activeProps={{ className: 'bg-primary/10 ring-primary/40 ring-1' }}
              activeOptions={{ exact: false }}
            >
              <SpaceAvatar space={space} size={24} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Daralmış menüde fareyle genişletme: 70 ms sonra açılır (yanlışlıkla geçişte titremez), fare
 * ayrılınca kısa bir beklemeyle kapanır. Klavye odağı içerideyken açık kalır, Esc kapatır; açık bir
 * açılır menü (Radix) varken kapanmaz.
 */
function useHoverOpen(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const schedule = useCallback((next: boolean, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    const run = () => {
      // Menüden açılan bir açılır pencere varken daralma.
      if (!next && document.querySelector('[data-radix-popper-content-wrapper]')) {
        timer.current = setTimeout(run, 300);
        return;
      }
      setOpen(next);
    };
    timer.current = setTimeout(run, delay);
  }, []);
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!enabled || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, open]);

  return {
    open: enabled && open,
    close: () => {
      clear();
      setOpen(false);
    },
    openNow: () => {
      clear();
      setOpen(true);
    },
    handlers: enabled
      ? {
          onMouseEnter: () => schedule(true, 70),
          onMouseLeave: () => schedule(false, 110),
          onFocus: () => schedule(true, 0),
          onBlur: (e: React.FocusEvent<HTMLElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget)) schedule(false, 120);
          },
        }
      : {},
  };
}

export function Sidebar() {
  const unread = useUnreadCount();
  const { t } = useTranslation();
  const { sidebarOpen, setSidebarOpen, sidebarPinned, setSidebarPinned } = useUiStore();
  const hover = useHoverOpen(!sidebarPinned);
  const expanded = sidebarPinned || hover.open;
  const workspace = useCurrentWorkspace();
  const isAdmin = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  // Misafirler mesajlaşamaz (ADR-098); onlar için yoklama da yapılmaz.
  const canMessage = workspace.role !== 'GUEST' && workspace.role !== 'VIEWER';
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
        id="app-sidebar"
        data-rail={!expanded}
        data-pinned={sidebarPinned}
        className={cn(
          'group/side border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-50 flex w-62 flex-col overflow-hidden border-r',
          // Mobil çekmece
          'max-md:transition-transform max-md:duration-300 max-md:ease-[var(--ease-out)]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          // Masaüstü: genişlik animasyonu, izolasyon (kural 3, 6)
          'md:translate-x-0 md:transition-[width] md:duration-[170ms] md:will-change-[width] md:[contain:layout_paint_style] md:data-[rail=true]:w-[66px] md:motion-reduce:transition-none',
          EASE,
          // Geçici genişlemede içeriğin üstünde durur: gölge (animasyonsuz).
          !sidebarPinned && expanded && 'md:shadow-[10px_0_36px_-14px_rgb(0_0_0/0.4)]',
        )}
        aria-label={t('app.name')}
        {...hover.handlers}
      >
        <div className="flex h-15 shrink-0 items-center gap-2.5 px-[17px]">
          <Logo size={32} className="flex-none" />
          <span className={cn('flex flex-col leading-none', LABEL)}>
            <span className="text-muted-foreground text-[10px] font-medium tracking-[0.22em]">
              EGEBIS
            </span>
            <span className="mt-0.5 text-[19px] font-bold tracking-tight">Seyir</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'text-muted-foreground hover:text-foreground ml-auto size-8 max-md:hidden',
              LABEL,
            )}
            aria-label={sidebarPinned ? t('nav.autoHideMenu') : t('nav.pinMenu')}
            title={sidebarPinned ? t('nav.autoHideMenu') : t('nav.pinMenu')}
            aria-pressed={sidebarPinned}
            onClick={() => {
              // Daraltırken fare menünün içindedir: menü ancak fare ayrılınca kapanır.
              if (sidebarPinned) hover.openNow();
              else hover.close();
              setSidebarPinned(!sidebarPinned);
            }}
          >
            <ChevronsLeft
              className={cn(
                'size-4 transition-transform duration-[170ms]',
                EASE,
                !sidebarPinned && 'rotate-180',
              )}
              aria-hidden
            />
          </Button>
        </div>
        <div className="border-sidebar-border flex h-12 items-center gap-2.5 border-y px-[19px]">
          <div className="bg-brand flex size-7 flex-none items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm">
            {workspace.name.slice(0, 1).toLocaleUpperCase('tr')}
          </div>
          <div className={cn('min-w-0 flex-1', LABEL)}>
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

        <nav className="flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2 md:group-data-[rail=true]/side:overflow-y-hidden">
          <SectionTitle className={cn('mt-1', LABEL)}>{t('nav.menu')}</SectionTitle>
          <NavLink to="/" icon={House} label={t('nav.home')} />
          <NavLink to="/my-work" icon={ListTodo} label={t('nav.myWork')} />
          <NavLink to="/bug-box" icon={Bug} label={t('nav.bugBox')} />
          <NavLink to="/goals" icon={Target} label={t('nav.goals')} />
          <NavLink to="/workload" icon={Users} label={t('nav.workload')} />
          {isAdmin && <NavLink to="/admin" icon={Gauge} label={t('nav.admin')} />}
          <NavLink to="/analytics" icon={ChartColumn} label={t('nav.analytics')} />
          {canMessage && (
            <NavLink
              to="/messages"
              icon={MessageSquare}
              label={t('nav.messages')}
              badge={unreadMessages}
            />
          )}
          <NavLink to="/notifications" icon={Inbox} label={t('nav.inbox')} badge={unread} />

          {/* Genişlemiş: tam ağaç. Daralmış: aynı yerde yalnızca Proje ikonları (çapraz geçiş). */}
          <div className="relative">
            <div
              className={cn(
                'transition-opacity duration-[170ms] motion-reduce:transition-none',
                'md:group-data-[rail=true]/side:pointer-events-none md:group-data-[rail=true]/side:opacity-0',
              )}
            >
              <SidebarTree />
            </div>
            <RailProjects />
          </div>
        </nav>

        <div className="border-sidebar-border flex flex-col gap-0.5 border-t p-2">
          <NavLink to="/settings" icon={Settings2} label={t('nav.settings')} exact={false} />
          {import.meta.env.DEV && (
            <NavLink to="/design" icon={Palette} label={t('nav.designSystem')} />
          )}
        </div>
      </aside>
    </>
  );
}
