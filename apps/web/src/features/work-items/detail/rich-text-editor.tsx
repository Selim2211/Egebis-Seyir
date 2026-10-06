import type { RichTextDoc } from '@scrum/shared';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Code2,
  ListChecks,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Minus,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Undo2,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const SAVE_DELAY_MS = 1500;

type ToolName =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'heading'
  | 'heading1'
  | 'heading3'
  | 'table'
  | 'rule'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'undo'
  | 'redo';

/**
 * Açıklama editörü (ADR-048): yalnızca sunucunun izin verdiği düğüm ve işaretler üretilir.
 * Yazarken 1,5 sn sonra veya odak çıkınca `onSave` çağrılır; boş belge `null` döner.
 * `editable=false` salt okunur görünüm verir (Stakeholder, arşivdeki öğe).
 * `variant="page"` doküman sayfası içindir: tablo, ayırıcı, H1–H3 ve geniş yazı alanı (ADR-069).
 */
export function RichTextEditor({
  value,
  editable,
  placeholder,
  onSave,
  label,
  variant = 'compact',
}: {
  value: RichTextDoc | null;
  editable: boolean;
  placeholder: string;
  onSave: (doc: RichTextDoc | null) => void;
  label: string;
  variant?: 'compact' | 'page';
}) {
  const { t } = useTranslation();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const editor = useEditor({
    editable,
    content: value ?? '',
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
      ...(variant === 'page'
        ? [
            TableKit.configure({ table: { resizable: false } }),
            TaskList,
            TaskItem.configure({ nested: true }),
          ]
        : []),
    ],
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        class: cn(
          'rich-text px-3 py-2 text-sm outline-none',
          variant === 'page' ? 'min-h-[24rem]' : 'min-h-24',
        ),
      },
    },
    onUpdate: () => {
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    onBlur: () => flush(),
  });

  function flush() {
    clearTimeout(timer.current);
    if (!editor || !dirty.current) return;
    dirty.current = false;
    onSaveRef.current(editor.isEmpty ? null : (editor.getJSON() as RichTextDoc));
  }

  // Dışarıdan gelen değer (başka kullanıcı, geri alma) düzenleme yokken editöre yansır.
  useEffect(() => {
    if (!editor || dirty.current || editor.isFocused) return;
    const current = JSON.stringify(editor.isEmpty ? null : editor.getJSON());
    if (current !== JSON.stringify(value))
      editor.commands.setContent(value ?? '', { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // Sekme gizlenirken (kapatma, başka sekmeye geçme) bekleyen değişiklik hemen gönderilsin.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushRef.current();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // Sayfadan çıkarken bekleyen değişiklik kaybolmasın.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current && editor) {
        dirty.current = false;
        onSaveRef.current(editor.isEmpty ? null : (editor.getJSON() as RichTextDoc));
      }
    },
    [editor],
  );

  if (!editor) return null;

  const setLink = () => {
    const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
    const href = window.prompt(t('editor.linkPrompt'), previous);
    if (href === null) return;
    if (href.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else if (/^(https?:\/\/|mailto:)/i.test(href.trim())) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
    }
  };

  const tool = (
    name: ToolName,
    icon: ReactNode,
    run: () => void,
    active = false,
    disabled = false,
  ) => (
    <button
      key={name}
      type="button"
      aria-label={t(`editor.${name}`)}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-7 items-center justify-center rounded outline-none focus-visible:ring-[3px] disabled:opacity-40',
        active && 'bg-accent text-foreground',
      )}
    >
      {icon}
    </button>
  );
  const chain = () => editor.chain().focus();

  return (
    <div
      className={cn(
        'bg-background rounded-md border',
        editable && 'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
      )}
    >
      {editable && (
        <div
          role="toolbar"
          aria-label={t('editor.toolbar')}
          className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1"
        >
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
            'strike',
            <Strikethrough className="size-4" />,
            () => chain().toggleStrike().run(),
            editor.isActive('strike'),
          )}
          {tool(
            'code',
            <Code className="size-4" />,
            () => chain().toggleCode().run(),
            editor.isActive('code'),
          )}
          {tool('link', <LinkIcon className="size-4" />, setLink, editor.isActive('link'))}
          <span className="bg-border mx-1 h-4 w-px" aria-hidden />
          {variant === 'page' &&
            tool(
              'heading1',
              <span className="text-xs font-bold">H1</span>,
              () => chain().toggleHeading({ level: 1 }).run(),
              editor.isActive('heading', { level: 1 }),
            )}
          {tool(
            'heading',
            <span className="text-xs font-bold">H2</span>,
            () => chain().toggleHeading({ level: 2 }).run(),
            editor.isActive('heading', { level: 2 }),
          )}
          {variant === 'page' &&
            tool(
              'heading3',
              <span className="text-xs font-bold">H3</span>,
              () => chain().toggleHeading({ level: 3 }).run(),
              editor.isActive('heading', { level: 3 }),
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
          {variant === 'page' &&
            tool(
              'taskList',
              <ListChecks className="size-4" />,
              () => chain().toggleTaskList().run(),
              editor.isActive('taskList'),
            )}
          {tool(
            'blockquote',
            <Quote className="size-4" />,
            () => chain().toggleBlockquote().run(),
            editor.isActive('blockquote'),
          )}
          {tool(
            'codeBlock',
            <Code2 className="size-4" />,
            () => chain().toggleCodeBlock().run(),
            editor.isActive('codeBlock'),
          )}
          {variant === 'page' && (
            <>
              {tool(
                'table',
                <TableIcon className="size-4" />,
                () => {
                  if (editor.isActive('table')) chain().deleteTable().run();
                  else chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                },
                editor.isActive('table'),
              )}
              {tool('rule', <Minus className="size-4" />, () => chain().setHorizontalRule().run())}
            </>
          )}
          <span className="bg-border mx-1 h-4 w-px" aria-hidden />
          {tool(
            'undo',
            <Undo2 className="size-4" />,
            () => chain().undo().run(),
            false,
            !editor.can().undo(),
          )}
          {tool(
            'redo',
            <Redo2 className="size-4" />,
            () => chain().redo().run(),
            false,
            !editor.can().redo(),
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
