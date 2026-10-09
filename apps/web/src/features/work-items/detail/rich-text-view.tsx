import { IMAGE_SRC_PATTERN, type RichTextMark, type RichTextNode } from '@scrum/shared';
import type { ReactNode } from 'react';

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function applyMarks(text: ReactNode, marks: RichTextMark[] | undefined): ReactNode {
  return (marks ?? []).reduce<ReactNode>((child, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{child}</strong>;
      case 'italic':
        return <em>{child}</em>;
      case 'strike':
        return <s>{child}</s>;
      case 'underline':
        return <u>{child}</u>;
      case 'code':
        return <code>{child}</code>;
      case 'link': {
        const href = str(mark.attrs?.href);
        // Sunucu zaten doğrular; savunma amaçlı bir kez daha.
        return SAFE_LINK.test(href) ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {child}
          </a>
        ) : (
          child
        );
      }
      default:
        return child;
    }
  }, text);
}

function renderNode(node: RichTextNode, key: number): ReactNode {
  const children = (node.content ?? []).map((child, i) => renderNode(child, i));
  switch (node.type) {
    case 'text':
      return <span key={key}>{applyMarks(node.text, node.marks)}</span>;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3'] as const)[
        Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 3) - 1
      ]!;
      return <Tag key={key}>{children}</Tag>;
    }
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return <ol key={key}>{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'taskList':
      return (
        <ul key={key} data-type="taskList" className="list-none pl-0">
          {children}
        </ul>
      );
    case 'taskItem':
      return (
        <li key={key} className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={node.attrs?.checked === true}
            disabled
            readOnly
            className="mt-1"
          />
          <div className="min-w-0 flex-1">{children}</div>
        </li>
      );
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case 'table':
      return (
        <div key={key} className="overflow-x-auto">
          <table>
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr key={key}>{children}</tr>;
    case 'tableHeader':
      return <th key={key}>{children}</th>;
    case 'tableCell':
      return <td key={key}>{children}</td>;
    case 'horizontalRule':
      return <hr key={key} />;
    case 'image': {
      const src = str(node.attrs?.src);
      // Sunucu yalnızca kendi ek adreslerini kabul eder; savunma amaçlı bir kez daha.
      return IMAGE_SRC_PATTERN.test(src) ? (
        <img
          key={key}
          src={src}
          alt={str(node.attrs?.alt)}
          loading="lazy"
          className="max-w-full rounded-md"
        />
      ) : null;
    }
    case 'hardBreak':
      return <br key={key} />;
    case 'mention':
      return (
        <span key={key} className="bg-primary/10 text-primary rounded px-1 font-medium">
          @{str(node.attrs?.label)}
        </span>
      );
    default:
      return null;
  }
}

/**
 * Zengin metin görüntüleyici (ADR-048): Tiptap belgesini doğrudan React öğelerine çevirir;
 * HTML dizgesi üretilmez, bilinmeyen düğüm çizilmez.
 */
export function RichTextView({ doc, className }: { doc: RichTextNode; className?: string }) {
  return (
    <div className={`rich-text text-sm break-words ${className ?? ''}`}>
      {(doc.content ?? []).map((node, i) => renderNode(node, i))}
    </div>
  );
}
