import type { RichTextDoc } from '@scrum/shared';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Code2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
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
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'codeBlock'
  | 'undo'
  | 'redo';

/**
 * Açıklama editörü (ADR-048): yalnızca sunucunun izin verdiği düğüm ve işaretler üretilir.
 * Yazarken 1,5 sn sonra veya odak çıkınca `onSave` çağrılır; boş belge `null` döner.
 * `editable=false` salt okunur görünüm verir (Stakeholder, arşivdeki öğe).
 */
export function RichTextEditor({
  value,
  editable,
  placeholder,
  onSave,
  label,
}: {
  value: RichTextDoc | null;
  editable: boolean;
  placeholder: string;
  onSave: (doc: RichTextDoc | null) => void;
  label: string;
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
    ],
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'rich-text min-h-24 px-3 py-2 text-sm outline-none',
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
          {tool(
            'heading',
            <span className="text-xs font-bold">H2</span>,
            () => chain().toggleHeading({ level: 2 }).run(),
            editor.isActive('heading', { level: 2 }),
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
