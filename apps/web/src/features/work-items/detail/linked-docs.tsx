import type { WorkItemDetail } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Bu öğeye bağlı doküman sayfaları (ADR-070); bağlama dokümandan yapılır. */
export function LinkedDocs({ item }: { item: WorkItemDetail }) {
  const { t } = useTranslation();
  if (item.docs.length === 0) return null;
  return (
    <section aria-labelledby="linked-docs-title">
      <h3 id="linked-docs-title" className="mb-1 text-sm font-semibold">
        {t('detail.linkedDocs')}
      </h3>
      <ul className="divide-y rounded-md border">
        {item.docs.map((doc) => (
          <li key={doc.id}>
            <Link
              to="/spaces/$spaceId/docs"
              params={{ spaceId: doc.spaceId }}
              search={{ doc: doc.id }}
              className="hover:bg-accent/50 flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="truncate">{doc.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
