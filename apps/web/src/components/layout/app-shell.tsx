import type { ReactNode } from 'react';
import { StructureActionsProvider } from '@/features/spaces/structure-actions';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/** Uygulama kabuğu: sol kenar çubuğu + üst çubuk + içerik (brief §10, madde 3). */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StructureActionsProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="page-enter flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </StructureActionsProvider>
  );
}
