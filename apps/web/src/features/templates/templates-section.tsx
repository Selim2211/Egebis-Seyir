import type { SpaceDetail, Template } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Play, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { docsQuery } from '@/features/docs/queries';
import { sprintsQuery } from '@/features/sprints/queries';
import { useHierarchy } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  useApplyTemplate,
  useDeleteSpaceTemplate,
  useDeleteTemplate,
  useSaveSpaceTemplate,
  useSaveTemplate,
  useSpaceTemplates,
  useTemplates,
} from './queries';

type SourceKind = 'LIST' | 'SPRINT' | 'DOC';
const SOURCE_KINDS: SourceKind[] = ['LIST', 'SPRINT', 'DOC'];

function Block({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {help && <p className="text-muted-foreground mt-0.5 text-xs">{help}</p>}
      </div>
      {children}
    </section>
  );
}

/** Space ayarlarında şablonlar (brief §5.8, ADR-083): List/Sprint/Doküman/İş şablonları ve Space şablonu. */
export function TemplatesSection({ space, canEdit }: { space: SpaceDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const { data } = useTemplates(space.id);
  const templates = data?.templates ?? [];

  return (
    <>
      <Block title={t('templates.title')} help={t('templates.help')}>
        {templates.length === 0 && (
          <p className="text-muted-foreground px-4 py-3 text-sm">{t('templates.none')}</p>
        )}
        <ul className="divide-y px-4">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              spaceId={space.id}
              template={template}
              canEdit={canEdit}
            />
          ))}
        </ul>
        {canEdit && <SaveFromSource spaceId={space.id} />}
      </Block>
      {canEdit && <SpaceTemplates space={space} />}
    </>
  );
}

function TemplateRow({
  spaceId,
  template,
  canEdit,
}: {
  spaceId: string;
  template: Template;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const apply = useApplyTemplate();
  const remove = useDeleteTemplate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const applicable =
    template.kind === 'LIST' || template.kind === 'SPRINT' || template.kind === 'DOC';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply.mutate(
      {
        spaceId,
        templateId: template.id,
        body: {
          ...(title.trim() && { title: title.trim() }),
          ...(template.kind === 'SPRINT' && { startDate }),
        },
      },
      {
        onSuccess: () => {
          toast.success(t('templates.applied', { name: template.name }));
          setOpen(false);
          setTitle('');
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-muted rounded px-1.5 py-0.5 text-[11px] font-medium">
          {t(`templates.kinds.${template.kind}`)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{template.name}</span>
        <span className="text-muted-foreground text-xs">
          {template.kind === 'ITEM'
            ? t('templates.useInList')
            : t(`templates.summary.${template.kind}`, { count: Number(template.summary) || 0 })}
        </span>
        {canEdit && applicable && (
          <Button
            variant="outline"
            size="sm"
            aria-label={t('templates.apply', { name: template.name })}
            onClick={() => setOpen((v) => !v)}
          >
            <Play />
            {t('templates.use')}
          </Button>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('templates.delete', { name: template.name })}
            onClick={() =>
              remove.mutate(
                { spaceId, templateId: template.id },
                { onError: (error) => toast.error(errorMessage(error)) },
              )
            }
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {open && (
        <form
          onSubmit={submit}
          className="bg-muted/30 mt-2 flex flex-wrap items-center gap-2 rounded-md p-3"
        >
          <Input
            className="h-8 min-w-48 flex-1"
            aria-label={t('templates.nameFor', { name: template.name })}
            placeholder={t('templates.namePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {template.kind === 'SPRINT' && (
            <Input
              type="date"
              className="h-8 w-40"
              aria-label={t('templates.startDate')}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          )}
          <Button
            type="submit"
            size="sm"
            disabled={apply.isPending || (template.kind === 'SPRINT' && !startDate)}
          >
            {t('templates.create')}
          </Button>
        </form>
      )}
    </li>
  );
}

function SaveFromSource({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const hierarchy = useHierarchy();
  const sprints = useQuery({ ...sprintsQuery(workspaceId, spaceId) });
  const docs = useQuery({ ...docsQuery(workspaceId, spaceId) });
  const save = useSaveTemplate();
  const [kind, setKind] = useState<SourceKind>('LIST');
  const [sourceId, setSourceId] = useState('');
  const [name, setName] = useState('');

  const treeSpace = hierarchy.data?.spaces.find((s) => s.id === spaceId);
  const sources: Array<{ id: string; label: string }> =
    kind === 'LIST'
      ? [
          ...(treeSpace?.lists ?? []),
          ...(treeSpace?.folders.flatMap((f) =>
            f.lists.map((l) => ({ ...l, name: `${f.name} / ${l.name}` })),
          ) ?? []),
        ].map((l) => ({ id: l.id, label: l.name }))
      : kind === 'SPRINT'
        ? (sprints.data?.sprints ?? []).map((s) => ({ id: s.id, label: s.name }))
        : (docs.data?.docs ?? []).map((d) => ({ id: d.id, label: d.title }));

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sourceId || !name.trim()) return;
        save.mutate(
          { spaceId, body: { kind, sourceId, name: name.trim() } },
          {
            onSuccess: () => {
              setName('');
              toast.success(t('templates.saved'));
            },
            onError: (error) => toast.error(errorMessage(error)),
          },
        );
      }}
    >
      <NativeSelect
        className="h-8"
        aria-label={t('templates.newKind')}
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as SourceKind);
          setSourceId('');
        }}
      >
        {SOURCE_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`templates.kinds.${k}`)}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        className="h-8 min-w-40"
        aria-label={t('templates.source')}
        value={sourceId}
        onChange={(e) => setSourceId(e.target.value)}
      >
        <option value="">{t('templates.chooseSource')}</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </NativeSelect>
      <Input
        className="h-8 min-w-40 flex-1"
        maxLength={80}
        aria-label={t('templates.newName')}
        placeholder={t('templates.newName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={!sourceId || !name.trim() || save.isPending}
      >
        {t('templates.save')}
      </Button>
      <p className="text-muted-foreground w-full text-xs">{t('templates.itemHint')}</p>
    </form>
  );
}

function SpaceTemplates({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data, isError } = useSpaceTemplates();
  const save = useSaveSpaceTemplate();
  const remove = useDeleteSpaceTemplate();
  const [name, setName] = useState('');
  if (isError) return null;
  const templates = data?.templates ?? [];

  return (
    <Block title={t('templates.spaceTitle')} help={t('templates.spaceHelp')}>
      <ul className="divide-y px-4">
        {templates.map((template) => (
          <li key={template.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{template.name}</span>
            <span className="text-muted-foreground text-xs">
              {t('templates.summary.SPACE', { count: Number(template.summary) || 0 })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t('templates.delete', { name: template.name })}
              onClick={() =>
                remove.mutate(template.id, { onError: (error) => toast.error(errorMessage(error)) })
              }
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          save.mutate(
            { name: name.trim(), sourceSpaceId: space.id },
            {
              onSuccess: () => {
                setName('');
                toast.success(t('templates.saved'));
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          );
        }}
      >
        <Input
          className="h-8 min-w-40 flex-1"
          maxLength={80}
          aria-label={t('templates.spaceName')}
          placeholder={t('templates.spaceName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!name.trim() || save.isPending}
        >
          {t('templates.saveSpace')}
        </Button>
      </form>
    </Block>
  );
}
