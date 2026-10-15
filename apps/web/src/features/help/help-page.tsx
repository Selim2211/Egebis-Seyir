import { FileDown, Info, Lightbulb, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import en from './guide.en.json';
import tr from './guide.tr.json';
import type { Guide, GuideBlock } from './guide-types';

const GUIDES: Record<string, Guide> = { tr: tr as unknown as Guide, en: en as unknown as Guide };

/** Word kılavuzunun adresi (public/help). */
export const guideDocxUrl = (language: string) =>
  `/help/Egebis-Seyir-${language === 'en' ? 'User-Guide' : 'Kullanim-Kilavuzu'}.docx`;

/** **kalın** işaretlerini <strong>'a çevirir. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="text-foreground font-semibold">
            {part}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

const CALLOUT = {
  tip: { icon: Lightbulb, className: 'border-emerald-500/40 bg-emerald-500/10', key: 'tip' },
  note: { icon: Info, className: 'border-sky-500/40 bg-sky-500/10', key: 'note' },
  warn: { icon: TriangleAlert, className: 'border-amber-500/50 bg-amber-500/10', key: 'warn' },
} as const;

function Block({ block, language }: { block: GuideBlock; language: string }): ReactNode {
  const { t } = useTranslation();
  switch (block.type) {
    case 'p':
      return (
        <p className="text-muted-foreground leading-relaxed">
          <Rich text={block.text} />
        </p>
      );
    case 'steps':
      return (
        <ol className="flex flex-col gap-2.5">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-3">
              <span
                aria-hidden
                className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              >
                {index + 1}
              </span>
              <span className="text-muted-foreground leading-relaxed">
                <Rich text={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'bullets':
      return (
        <ul className="text-muted-foreground flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
          {block.items.map((item, index) => (
            <li key={index}>
              <Rich text={item} />
            </li>
          ))}
        </ul>
      );
    case 'tip':
    case 'note':
    case 'warn': {
      const { icon: Icon, className, key } = CALLOUT[block.type];
      return (
        <div className={cn('flex gap-3 rounded-lg border p-3 text-sm', className)} role="note">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="leading-relaxed">
            <strong className="font-semibold">{t(`help.${key}`)}: </strong>
            <Rich text={block.text} />
          </p>
        </div>
      );
    }
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60">
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} className="px-3 py-2 font-semibold">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index} className="border-t align-top">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={cn('px-3 py-2', i === 0 ? 'font-medium' : 'text-muted-foreground')}
                    >
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'figure': {
      const src = `/help/${language}/${block.image}.png`;
      return (
        <figure className="bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-xs">
          <a href={src} target="_blank" rel="noreferrer" title={t('help.zoom')}>
            <img
              src={src}
              alt={block.alt}
              loading="lazy"
              className="w-full rounded-lg border"
              width={1280}
            />
          </a>
          <figcaption className="text-muted-foreground text-xs">{block.caption}</figcaption>
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {block.legend.map((item, index) => (
              <li key={index} className="flex gap-2 text-sm">
                <span
                  aria-hidden
                  className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white"
                >
                  {index + 1}
                </span>
                <span>
                  <Rich text={item} />
                </span>
              </li>
            ))}
          </ol>
        </figure>
      );
    }
  }
}

/** Yardım ve kullanıcı kılavuzu: içindekiler + görselli anlatım (arayüz diline göre). */
export function HelpPage({ section }: { section?: string }) {
  const { t } = useTranslation();
  const language = useUiStore((s) => s.language);
  const guide = GUIDES[language] ?? GUIDES.tr!;
  const [active, setActive] = useState(section ?? guide.sections[0]?.id);
  const sections = useMemo(() => guide.sections, [guide]);

  // Adresteki #bölüm (ya da ?section) ile doğrudan açılır.
  useEffect(() => {
    if (!section) return;
    document.getElementById(section)?.scrollIntoView({ block: 'start' });
  }, [section]);

  // Kaydırırken içindekiler listesinde bulunulan bölüm vurgulanır.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -75% 0px' },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6">
      <nav aria-label={t('help.toc')} className="sticky top-4 hidden h-fit w-60 shrink-0 lg:block">
        <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
          {t('help.toc')}
        </p>
        <ul className="flex flex-col gap-0.5 border-l">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                aria-current={active === s.id ? 'true' : undefined}
                className={cn(
                  '-ml-px block border-l-2 px-3 py-1.5 text-sm transition-colors',
                  active === s.id
                    ? 'border-primary text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent',
                )}
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="min-w-0 flex-1">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{guide.title}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{guide.subtitle}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={guideDocxUrl(language)} download>
              <FileDown />
              {t('help.downloadWord')}
            </a>
          </Button>
        </header>
        <div className="mt-6 flex flex-col gap-12">
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className="scroll-mt-20"
            >
              <h2 id={`${s.id}-title`} className="mb-4 text-xl font-semibold tracking-tight">
                {s.title}
              </h2>
              <div className="flex flex-col gap-4">
                {s.blocks.map((block, index) => (
                  <Block key={index} block={block} language={language} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
