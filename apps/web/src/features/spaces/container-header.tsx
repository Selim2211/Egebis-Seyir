import type { FavoriteType, SpaceIcon } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { Archive, ChevronRight, SearchX, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useStructureActions } from './actions-context';
import { useHierarchy } from './queries';
import { SpaceAvatar } from './space-avatar';

interface Crumb {
  space: { id: string; name: string; color: string; icon: SpaceIcon | null };
  folder?: { id: string; name: string } | null;
}

/** Space/Folder/List sayfa başlığı: konum, ad, favori yıldızı, arşiv uyarısı (taslak 1). */
export function ContainerHeader({
  type,
  id,
  name,
  crumb,
  archived,
  canUnarchive,
  meta,
  actions,
  children,
}: {
  type: FavoriteType;
  id: string;
  name: string;
  crumb?: Crumb;
  archived: boolean;
  canUnarchive: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const structure = useStructureActions();
  const favorite = useHierarchy().data?.favorites.some((f) => f.type === type && f.id === id);

  return (
    <div className="border-b px-4 pt-4 sm:px-6">
      {crumb && (
        <nav
          aria-label={t('structure.breadcrumb')}
          className="text-muted-foreground mb-1 flex min-w-0 items-center gap-1.5 text-sm"
        >
          <SpaceAvatar space={crumb.space} size={18} />
          <Link
            to="/spaces/$spaceId"
            params={{ spaceId: crumb.space.id }}
            className="truncate hover:underline"
          >
            {crumb.space.name}
          </Link>
          {crumb.folder && (
            <>
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <Link
                to="/folders/$folderId"
                params={{ folderId: crumb.folder.id }}
                className="truncate hover:underline"
              >
                {crumb.folder.name}
              </Link>
            </>
          )}
        </nav>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">{name}</h1>
        {!archived && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-pressed={!!favorite}
            aria-label={t(favorite ? 'structure.removeFavorite' : 'structure.addFavorite')}
            onClick={() => structure.setFavorite(type, id, !favorite)}
          >
            <Star className={favorite ? 'fill-amber-400 text-amber-500' : ''} />
          </Button>
        )}
        {meta}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {archived && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <Archive className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{t('structure.archivedBanner')}</span>
          {canUnarchive && (
            <Button size="sm" variant="outline" onClick={() => structure.unarchive(type, id)}>
              {t('structure.unarchive')}
            </Button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** Kayıt yok veya erişim yok (API ikisini de 404 döner). */
export function NotFoundState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      <SearchX className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-lg font-medium">{t('structure.notFoundTitle')}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t('structure.notFoundBody')}</p>
      <Button asChild variant="outline" className="mt-2">
        <Link to="/">{t('notFound.back')}</Link>
      </Button>
    </div>
  );
}

export function LoadingState() {
  const { t } = useTranslation();
  return <p className="text-muted-foreground px-6 py-10 text-sm">{t('common.loading')}</p>;
}

/** Space/Folder/List sayfasına bağlantı (tür bazlı rota). */
export function ContainerLink({
  type,
  id,
  className,
  onClick,
  children,
}: {
  type: FavoriteType;
  id: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const common = { className, onClick };
  if (type === 'SPACE') {
    return (
      <Link to="/spaces/$spaceId" params={{ spaceId: id }} {...common}>
        {children}
      </Link>
    );
  }
  if (type === 'FOLDER') {
    return (
      <Link to="/folders/$folderId" params={{ folderId: id }} {...common}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/lists/$listId" params={{ listId: id }} {...common}>
      {children}
    </Link>
  );
}
