import { docToMarkdown, type DocDetail, type RichTextDoc } from '@scrum/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, FileDown, FileText, History, Printer, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Attachments } from '@/features/work-items/detail/attachments';
import { RichTextEditor } from '@/features/work-items/detail/rich-text-editor';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUploadAttachment } from '@/features/work-items/queries';
import { docToDocxBlob, fetchDocxImage } from './doc-docx';
import { useRestoreDoc } from './queries';
import { Comments } from '@/features/work-items/detail/comments';
import { DocLinks } from './doc-links';
import { useDocSaver } from './use-doc-saver';

const TITLE_DELAY_MS = 800;

/**
 * Tek sayfa: başlık + zengin metin + kayıt durumu. Bileşen sayfa kimliği ve sunucu revision'ı ile
 * `key`lenir; yerel durum yalnızca bu yaşam döngüsü içinde tutulur (ADR-069).
 */
export function DocEditor({
  doc,
  spaceId,
  canWrite,
  canComment,
  onOpenVersions,
  onSelect,
  onReload,
}: {
  doc: DocDetail;
  spaceId: string;
  canWrite: boolean;
  canComment: boolean;
  onOpenVersions: () => void;
  onSelect: (id: string) => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const restore = useRestoreDoc(spaceId);
  const saver = useDocSaver(doc.id, doc.revision);
  const upload = useUploadAttachment();
  // Sayfaya görsel: dosya sayfanın eki olarak yüklenir, içerikte kendi adresiyle yer alır (ADR-106).
  const uploadImage = async (file: File): Promise<string> => {
    try {
      const { id } = await upload.mutateAsync({ itemId: doc.id, file, scope: 'docs' });
      return `/api/workspaces/${workspaceId}/docs/${doc.id}/attachments/${id}?preview=1`;
    } catch (error) {
      toast.error(t('docs.imageUploadFailed'));
      throw error;
    }
  };
  const downloadWord = async () => {
    try {
      const blob = await docToDocxBlob(doc.title, content, fetchDocxImage);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'sayfa'}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('docs.exportFailed'));
    }
  };
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState<RichTextDoc | null>(doc.content);
  const titleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleDirty = useRef(false);
  const editable = canWrite && !doc.deleted;

  const flushTitle = () => {
    clearTimeout(titleTimer.current);
    if (!titleDirty.current) return;
    titleDirty.current = false;
    const next = title.trim();
    if (next) saver.save({ title: next });
  };
  const flushTitleRef = useRef(flushTitle);
  useEffect(() => {
    flushTitleRef.current = flushTitle;
  });
  // Sayfadan çıkarken bekleyen başlık kaybolmasın.
  useEffect(() => () => flushTitleRef.current(), []);

  // Kayıt başarılı olunca ağaçtaki başlık güncellensin.
  useEffect(() => {
    if (saver.state === 'saved') {
      void qc.invalidateQueries({
        queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'docs'],
      });
    }
  }, [saver.state, saver.savedAt, qc, workspaceId, spaceId]);

  const onTitle = (value: string) => {
    setTitle(value);
    titleDirty.current = true;
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      titleDirty.current = false;
      const next = value.trim();
      if (next) saver.save({ title: next });
    }, TITLE_DELAY_MS);
  };

  return (
    <article className="doc-print flex min-w-0 flex-col gap-3">
      {doc.ancestors.length > 0 && (
        <nav
          aria-label={t('docs.breadcrumb')}
          className="text-muted-foreground flex flex-wrap gap-1 text-xs"
        >
          {doc.ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <button type="button" className="hover:underline" onClick={() => onSelect(a.id)}>
                {a.title}
              </button>
              <span aria-hidden>/</span>
            </span>
          ))}
        </nav>
      )}

      {doc.deleted && (
        <div
          role="status"
          className="bg-muted flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <span>{t('docs.deletedNotice')}</span>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              disabled={restore.isPending}
              onClick={() => void restore.mutateAsync(doc.id).then(onReload)}
            >
              <RotateCcw /> {t('docs.restore')}
            </Button>
          )}
        </div>
      )}

      {saver.state === 'conflict' && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
          <span className="flex-1">{t('errors.DOC_CONFLICT')}</span>
          <Button size="sm" variant="outline" onClick={onReload}>
            {t('docs.reload')}
          </Button>
        </div>
      )}

      <div className="flex items-start gap-2">
        {editable ? (
          <Input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            onBlur={flushTitle}
            maxLength={200}
            aria-label={t('docs.title')}
            placeholder={t('docs.untitled')}
            className="h-11 border-transparent px-2 text-2xl font-semibold shadow-none focus-visible:border-input"
          />
        ) : (
          <h1 className="px-2 text-2xl font-semibold">{doc.title}</h1>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-1.5 shrink-0 print:hidden"
          onClick={() => {
            const blob = new Blob([docToMarkdown(doc.title, doc.content)], {
              type: 'text/markdown;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${doc.title.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'sayfa'}.md`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          <FileDown /> {t('docs.exportMarkdown')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="mt-1.5 shrink-0 print:hidden"
          onClick={() => void downloadWord()}
        >
          <FileText /> {t('docs.exportWord')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="mt-1.5 shrink-0 print:hidden"
          onClick={() => window.print()}
        >
          <Printer /> {t('docs.print')}
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenVersions} className="mt-1.5 shrink-0">
          <History /> {t('docs.versions')}
        </Button>
      </div>

      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 px-2 text-xs">
        {doc.updatedBy && (
          <span>
            {t('docs.updatedBy', { name: doc.updatedBy.name, when: relativeTime(doc.updatedAt) })}
          </span>
        )}
        <span
          role="status"
          aria-live="polite"
          className={cn(saver.state === 'error' && 'text-destructive')}
        >
          {saver.state === 'saving' && t('docs.saving')}
          {saver.state === 'saved' && t('docs.saved')}
          {saver.state === 'error' && t('docs.saveError')}
        </span>
      </p>

      <RichTextEditor
        variant="page"
        onUploadImage={editable ? uploadImage : undefined}
        value={content}
        editable={editable}
        label={t('docs.content')}
        placeholder={t('docs.contentPlaceholder')}
        onSave={(next) => {
          setContent(next);
          saver.save({ content: next });
        }}
      />
      <DocLinks doc={doc} canWrite={editable} />
      <div className="px-2">
        <Attachments
          itemId={doc.id}
          attachments={doc.attachments}
          canWrite={editable}
          scope="docs"
        />
      </div>

      <div className="px-2 pt-2">
        <Comments itemId={doc.id} scope="docs" canComment={canComment && !doc.deleted} />
      </div>
    </article>
  );
}

/** Sayfa yüklenemediyse (silinmiş/izinsiz) gösterilen boş durum. */
export function DocMissing({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
      <p>{t('docs.missing')}</p>
      <Link
        to="/spaces/$spaceId/docs"
        params={{ spaceId }}
        search={{}}
        className="text-primary hover:underline"
      >
        {t('docs.backToDocs')}
      </Link>
    </div>
  );
}
