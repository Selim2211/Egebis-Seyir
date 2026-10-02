import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ItemDetail } from '@/features/work-items/detail/item-detail';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';

export const Route = createFileRoute('/_app/items/$key')({
  component: ItemPage,
});

/** Tam sayfa görev detayı: `/items/MOB-142` paylaşılabilir bağlantıdır (ADR-033). */
function ItemPage() {
  const { key } = Route.useParams();
  const navigate = useNavigate();
  return (
    <ItemNavContext.Provider
      value={(next) => void navigate({ to: '/items/$key', params: { key: next } })}
    >
      <div className="mx-auto max-w-6xl">
        <ItemDetail itemKey={key} variant="page" />
      </div>
    </ItemNavContext.Provider>
  );
}
