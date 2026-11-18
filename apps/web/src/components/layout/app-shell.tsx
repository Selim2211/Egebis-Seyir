import type { ReactNode } from 'react';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { StructureActionsProvider } from '@/features/spaces/structure-actions';
import { OutsourceProvider } from '@/features/workspace/outsource-provider';
import { RouteProgress } from './route-progress';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/** Uygulama kabuğu: sol kenar çubuğu + üst çubuk + içerik (brief §10, madde 3). */
export function AppShell({ children }: { children: ReactNode }) {
  const pinned = useUiStore((s) => s.sidebarPinned);
  return (
    <StructureActionsProvider>
      <OutsourceProvider>
        <RouteProgress />
        <div className="flex h-dvh overflow-hidden">
          <Sidebar />
          {/*
            Menü `fixed` olduğundan içeriğin soldaki boşluğu burada verilir: daralmışken hep 66 px, yalnızca
            sabit açıkken 248 px. Geçiş YOK: menü hover'da genişlerken içerik oynamaz (ADR-174).
          */}
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col transition-none',
              pinned ? 'md:ml-[248px]' : 'md:ml-[66px]',
            )}
          >
            <Topbar />
            <main className="page-enter flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </OutsourceProvider>
    </StructureActionsProvider>
  );
}
