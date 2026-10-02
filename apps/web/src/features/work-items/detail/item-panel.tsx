import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ItemDetail } from './item-detail';
import { ItemNavContext } from './item-nav-context';

/**
 * Listeden çıkmadan görevi açan yan panel (brief §11 "yan panel görev detayı").
 * Durum adresteki `?item=MOB-12` ile tutulur: paylaşılabilir, geri tuşu paneli kapatır.
 */
export function ItemPanel({ itemKey }: { itemKey: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setItem = (item: string | undefined) =>
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, item }),
      replace: item === undefined,
    });

  return (
    <Dialog open={!!itemKey} onOpenChange={(open) => !open && setItem(undefined)}>
      <DialogContent
        className="top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-2xl translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{itemKey}</DialogTitle>
        <DialogDescription className="sr-only">{t('detail.panelHelp')}</DialogDescription>
        {itemKey && (
          <ItemNavContext.Provider value={(key) => setItem(key)}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ItemDetail itemKey={itemKey} variant="panel" onClose={() => setItem(undefined)} />
            </div>
          </ItemNavContext.Provider>
        )}
      </DialogContent>
    </Dialog>
  );
}
