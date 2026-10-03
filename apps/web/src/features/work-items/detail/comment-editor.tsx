import type { MentionCandidates, RichTextDoc } from '@scrum/shared';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Code, Italic, List, ListOrdered, Send } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { cn } from '@/lib/utils';
import { type CommentScope, fetchMentionCandidates } from '../queries';

type Candidate = MentionCandidates['users'][number];

interface Suggest {
  items: Candidate[];
  index: number;
  command: (attrs: { id: string; label: string }) => void;
  /** Önerinin editör kutusuna göre konumu (olay anında hesaplanır). */
  pos: { left: number; top: number } | null;
}

/**
 * Yorum yazma/düzenleme editörü (ADR-055): `@` ile öğeyi görebilen kişiler önerilir.
 * Ctrl/Cmd+Enter gönderir. Boş belge gönderilmez.
 */
export function CommentEditor({
  itemId,
  scope = 'items',
  initial,
  submitLabel,
  placeholder,
  autoFocus,
  pending,
  onSubmit,
  onCancel,
}: {
  itemId: string;
  scope?: CommentScope;
  initial?: RichTextDoc;
  submitLabel: string;
  placeholder: string;
  autoFocus?: boolean;
  pending?: boolean;
  onSubmit: (doc: RichTextDoc) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const wrapper = useRef<HTMLDivElement>(null);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  // Tiptap geri çağrıları kurulum sırasında yakalanır; güncel değerlere ref ile ulaşılır.
  const suggestRef = useRef<Suggest | null>(null);
  const submitRef = useRef<() => void>(() => undefined);

  /** İmleç dikdörtgenini (görünüm koordinatı) editör kutusuna göre konuma çevirir. */
  const position = (rect: DOMRect | null) => {
    const box = wrapper.current?.getBoundingClientRect();
    if (!rect || !box) return null;
    return {
      left: Math.max(0, Math.min(rect.left - box.left, box.width - 240)),
      top: rect.bottom - box.top + 4,
    };
  };

  const update = (next: Suggest | null) => {
    suggestRef.current = next;
    setSuggest(next);
  };

  const editor = useEditor({
    content: initial ?? '',
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
        },
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        renderText: ({ node }) => `@${String(node.attrs.label)}`,
        suggestion: {
          char: '@',
          items: async ({ query }) =>
            (await fetchMentionCandidates(workspaceId, itemId, query, scope)).users,
          render: () => ({
            onStart: (props) =>
              update({
                items: props.items as Candidate[],
                index: 0,
                command: props.command,
                pos: position(props.clientRect?.() ?? null),
              }),
            onUpdate: (props) =>
              update({
                items: props.items as Candidate[],
                index: 0,
                command: props.command,
                pos: position(props.clientRect?.() ?? null),
              }),
            onKeyDown: ({ event }) => {
              const state = suggestRef.current;
              if (!state || state.items.length === 0) return false;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const step = event.key === 'ArrowDown' ? 1 : -1;
                update({
                  ...state,
                  index: (state.index + step + state.items.length) % state.items.length,
                });
                return true;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const picked = state.items[state.index];
                if (picked) state.command({ id: picked.id, label: picked.name });
                return true;
              }
              if (event.key === 'Escape') {
                update(null);
                return true;
              }
              return false;
            },
            onExit: () => update(null),
          }),
        },
      }),
    ],
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': placeholder,
        class: 'rich-text min-h-16 px-3 py-2 text-sm outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          submitRef.current();
          return true;
        }
        return false;
      },
    },
  });

  const submit = () => {
    if (!editor || editor.isEmpty || pending) return;
    onSubmit(editor.getJSON() as RichTextDoc);
    editor.commands.clearContent(true);
  };
  useEffect(() => {
    submitRef.current = submit;
  });

  if (!editor) return null;

  const tool = (
    name: 'bold' | 'italic' | 'code' | 'bulletList' | 'orderedList',
    icon: ReactNode,
    run: () => void,
    active: boolean,
  ) => (
    <button
      key={name}
      type="button"
      aria-label={t(`editor.${name}`)}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-7 items-center justify-center rounded',
        active && 'bg-accent text-foreground',
      )}
    >
      {icon}
    </button>
  );
  const chain = () => editor.chain().focus();

  return (
    <div ref={wrapper} className="relative">
      <div className="bg-background focus-within:border-ring focus-within:ring-ring/50 rounded-md border focus-within:ring-[3px]">
        <EditorContent editor={editor} />
        <div className="flex items-center gap-0.5 border-t px-1.5 py-1">
          {tool(
            'bold',
            <Bold className="size-4" />,
            () => chain().toggleBold().run(),
            editor.isActive('bold'),
          )}
          {tool(
            'italic',
            <Italic className="size-4" />,
            () => chain().toggleItalic().run(),
            editor.isActive('italic'),
          )}
          {tool(
            'code',
            <Code className="size-4" />,
            () => chain().toggleCode().run(),
            editor.isActive('code'),
          )}
          {tool(
            'bulletList',
            <List className="size-4" />,
            () => chain().toggleBulletList().run(),
            editor.isActive('bulletList'),
          )}
          {tool(
            'orderedList',
            <ListOrdered className="size-4" />,
            () => chain().toggleOrderedList().run(),
            editor.isActive('orderedList'),
          )}
          <span className="text-muted-foreground ml-2 hidden text-xs sm:inline">
            {t('comments.hint')}
          </span>
          <span className="ml-auto flex gap-1.5">
            {onCancel && (
              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
            )}
            <Button type="button" size="sm" onClick={submit} disabled={pending}>
              <Send />
              {submitLabel}
            </Button>
          </span>
        </div>
      </div>

      {suggest && suggest.items.length > 0 && suggest.pos && (
        <ul
          role="listbox"
          aria-label={t('comments.mentionList')}
          className="bg-popover absolute z-30 max-h-56 w-60 overflow-y-auto rounded-md border p-1 shadow-md"
          style={{ left: suggest.pos.left, top: suggest.pos.top }}
        >
          {suggest.items.map((user, i) => (
            <li key={user.id} role="option" aria-selected={i === suggest.index}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  suggest.command({ id: user.id, label: user.name });
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                  i === suggest.index && 'bg-accent',
                )}
              >
                <UserAvatar
                  id={user.id}
                  name={user.name}
                  size={20}
                  avatarVersion={user.avatarVersion}
                />
                {user.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
