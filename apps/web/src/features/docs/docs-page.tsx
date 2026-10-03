import { SPACE_PERMISSIONS as S, type DocNodeDto } from '@scrum/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FilePlus, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { MoveDocDialog, TrashDialog, VersionsDialog } from './doc-dialogs';
import { DocEditor, DocMissing } from './doc-editor';
import { DocTree } from './doc-tree';
import { docQuery, docsQuery, useCreateDoc, useDeleteDoc, useMoveDoc } from './queries';

/** Space dokümanları: sol sayfa ağacı, sağda seçili sayfanın editörü (brief §5.12, ADR-069). */
export function DocsPage({ spaceId, docId }: { spaceId: string; docId: string | null }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const docs = useQuery(docsQuery(workspaceId, spaceId));
  const create = useCreateDoc(spaceId);
  const move = useMoveDoc(spaceId);
  const remove = useDeleteDoc(spaceId);
  const [moving, setMoving] = useState<DocNodeDto | null>(null);
  const [deleting, setDeleting] = useState<DocNodeDto | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  if (space.isPending || docs.isPending) return <LoadingState />;
  if (space.isError || docs.isError) return <NotFoundState />;

  const canWrite = space.data.permissions.includes(S.DOC_WRITE) && !space.data.archived;
  const canComment = space.data.permissions.includes(S.COMMENT_WRITE) && !space.data.archived;
  const select = (id: string | null) =>
    void navigate({
      to: '/spaces/$spaceId/docs',
      params: { spaceId },
      search: id ? { doc: id } : {},
    });

  const add = (parentId: string | null) =>
    void create
      .mutateAsync({ title: t('docs.untitled'), parentId })
      .then(({ id }) => select(id))
      .catch((error) => toast.error(errorMessage(error)));

  const reload = () =>
    void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'docs', docId] });

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside aria-label={t('docs.pages')} className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <h2 className="flex-1 text-sm font-semibold">{t('docs.pages')}</h2>
            {canWrite && (
              <Button
                size="sm"
                variant="outline"
                disabled={create.isPending}
                onClick={() => add(null)}
              >
                <FilePlus /> {t('docs.newPage')}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={t('docs.trash')}
              onClick={() => setShowTrash(true)}
            >
              <Trash2 />
            </Button>
          </div>
          {docs.data.docs.length === 0 ? (
            <p className="text-muted-foreground px-1 py-4 text-sm">{t('docs.emptyTree')}</p>
          ) : (
            <DocTree
              docs={docs.data.docs}
              selectedId={docId}
              canWrite={canWrite}
              actions={{
                onSelect: select,
                onAddChild: add,
                onMoveTo: setMoving,
                onReorder: (id, afterId) =>
                  void move
                    .mutateAsync({
                      docId: id,
                      parentId: docs.data.docs.find((d) => d.id === id)?.parentId ?? null,
                      afterId,
                    })
                    .catch((error) => toast.error(errorMessage(error))),
                onDelete: setDeleting,
              }}
            />
          )}
        </aside>

        <section aria-label={t('docs.page')} className="min-w-0">
          {docId ? (
            <OpenDoc
              key={docId}
              docId={docId}
              spaceId={spaceId}
              canWrite={canWrite}
              canComment={canComment}
              onSelect={select}
              onReload={reload}
              onOpenVersions={() => setShowVersions(true)}
            />
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-20 text-sm">
              <FileText className="size-8" aria-hidden />
              <p>{docs.data.docs.length === 0 ? t('docs.emptyHint') : t('docs.pickHint')}</p>
              {canWrite && docs.data.docs.length === 0 && (
                <Button size="sm" onClick={() => add(null)}>
                  <FilePlus /> {t('docs.newPage')}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>

      {moving && (
        <MoveDocDialog
          spaceId={spaceId}
          doc={moving}
          docs={docs.data.docs}
          onClose={() => setMoving(null)}
        />
      )}
      {showVersions && docId && (
        <VersionsDialog
          spaceId={spaceId}
          docId={docId}
          canWrite={canWrite}
          onClose={() => setShowVersions(false)}
          onRestored={() => setShowVersions(false)}
        />
      )}
      {showTrash && (
        <TrashDialog
          spaceId={spaceId}
          canWrite={canWrite}
          onClose={() => setShowTrash(false)}
          onRestored={(id) => {
            setShowTrash(false);
            select(id);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('docs.deleteTitle', { title: deleting?.title ?? '' })}
        description={t('docs.deleteHint')}
        confirmLabel={t('docs.delete')}
        pending={remove.isPending}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          void remove
            .mutateAsync(target.id)
            .then(() => {
              setDeleting(null);
              toast.success(t('docs.deleted', { title: target.title }));
              if (docId === target.id) select(null);
            })
            .catch((error) => toast.error(errorMessage(error)));
        }}
      />
    </>
  );
}

/** Seçili sayfayı yükler; editör `revision` ile yeniden kurulur (sürüme dönünce taze durum). */
function OpenDoc({
  docId,
  spaceId,
  canWrite,
  canComment,
  onSelect,
  onReload,
  onOpenVersions,
}: {
  docId: string;
  spaceId: string;
  canWrite: boolean;
  canComment: boolean;
  onSelect: (id: string) => void;
  onReload: () => void;
  onOpenVersions: () => void;
}) {
  const { id: workspaceId } = useCurrentWorkspace();
  const doc = useQuery(docQuery(workspaceId, docId));
  if (doc.isPending) return <LoadingState />;
  if (doc.isError) return <DocMissing spaceId={spaceId} />;
  return (
    <DocEditor
      key={`${doc.data.id}:${doc.data.revision}`}
      doc={doc.data}
      spaceId={spaceId}
      canWrite={canWrite}
      canComment={canComment}
      onOpenVersions={onOpenVersions}
      onSelect={onSelect}
      onReload={onReload}
    />
  );
}
