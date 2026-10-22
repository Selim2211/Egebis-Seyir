import { type Editor, useEditorState } from '@tiptap/react';
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Ban,
  Columns3,
  Merge,
  PanelLeft,
  PanelTop,
  Rows3,
  Split,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CELL_COLORS } from './table-extensions';

/** Izgaradan seçilebilen en büyük tablo (Word'deki gibi); daha büyüğü sayı girerek eklenir. */
const GRID_ROWS = 8;
const GRID_COLS = 10;
const MAX_SIZE = 50;

/**
 * Tablo menüsü (Word'deki "Tablo" düğmesi gibi): tek düğme, tıklayınca tüm tablo araçları açılır.
 * Tablo dışındayken ızgaradan ya da sayıyla tablo eklenir; tablo içindeyken satır/sütun ekleme-silme,
 * hücre birleştirme-bölme, başlık satırı/sütunu, hücre rengi ve tabloyu silme görünür.
 * Düğmeler odağı editörden almaz (onMouseDown), böylece imleç tablodaki yerinde kalır.
 */
export function TableMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Editör durumu her işlemde yeniden okunur (satır ekleyince "birleştir" vb. hemen güncellenir).
  const state = useEditorState({
    editor,
    selector: ({ editor: e }): TableState & { inTable: boolean } => {
      const can = e.can();
      return {
        inTable: e.isActive('table'),
        addRowBefore: can.addRowBefore(),
        addRowAfter: can.addRowAfter(),
        deleteRow: can.deleteRow(),
        addColumnBefore: can.addColumnBefore(),
        addColumnAfter: can.addColumnAfter(),
        deleteColumn: can.deleteColumn(),
        mergeCells: can.mergeCells(),
        splitCell: can.splitCell(),
        toggleHeaderRow: can.toggleHeaderRow(),
        toggleHeaderColumn: can.toggleHeaderColumn(),
        deleteTable: can.deleteTable(),
        color:
          (e.getAttributes('tableCell').backgroundColor as string | null | undefined) ??
          (e.getAttributes('tableHeader').backgroundColor as string | null | undefined) ??
          null,
      };
    },
  });
  const inTable = state.inTable;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('editor.table')}
          aria-pressed={inTable}
          data-testid="table-menu"
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex h-7 items-center justify-center gap-1 rounded px-1.5 text-xs font-medium outline-none focus-visible:ring-[3px]',
            (inTable || open) && 'bg-accent text-foreground',
          )}
        >
          <TableIcon className="size-4" />
          {t('editor.tableMenu.label')}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'max-h-(--radix-popover-content-available-height) overflow-y-auto',
          inTable ? 'w-[26rem]' : 'w-[19rem]',
        )}
        collisionPadding={12}
        // Editörün seçimi korunur: içerik açılırken odak çalınmaz.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {inTable ? (
          <TableTools editor={editor} state={state} onDone={() => setOpen(false)} />
        ) : (
          <InsertTable
            onInsert={(rows, cols) => {
              editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Izgara (fareyle boyut seçme) + elle satır/sütun sayısı. */
function InsertTable({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState({ rows: 0, cols: 0 });
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const clamp = (n: number) => Math.min(Math.max(Math.round(n) || 1, 1), MAX_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{t('editor.tableMenu.insert')}</p>
      <div
        role="grid"
        aria-label={t('editor.tableMenu.grid')}
        className="grid w-fit gap-0.5"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1.25rem)` }}
        onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
      >
        {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
          const r = Math.floor(i / GRID_COLS) + 1;
          const c = (i % GRID_COLS) + 1;
          const lit = r <= hover.rows && c <= hover.cols;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-label={t('editor.tableMenu.size', { rows: r, cols: c })}
              data-cell={`${r}x${c}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHover({ rows: r, cols: c })}
              onFocus={() => setHover({ rows: r, cols: c })}
              onClick={() => onInsert(r, c)}
              className={cn(
                'size-5 rounded-[3px] border transition-colors',
                lit ? 'border-primary bg-primary/25' : 'border-border bg-background',
              )}
            />
          );
        })}
      </div>
      <p className="text-muted-foreground h-4 text-xs tabular-nums" aria-live="polite">
        {hover.rows > 0
          ? t('editor.tableMenu.size', { rows: hover.rows, cols: hover.cols })
          : t('editor.tableMenu.hint')}
      </p>
      <div className="border-t pt-3">
        <p className="mb-2 text-xs font-medium">{t('editor.tableMenu.custom')}</p>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            {t('editor.tableMenu.rows')}
            <input
              type="number"
              min={1}
              max={MAX_SIZE}
              value={rows}
              onChange={(e) => setRows(clamp(Number(e.target.value)))}
              className="border-input bg-background h-8 w-16 rounded-md border px-2 text-sm"
            />
          </label>
          <span className="text-muted-foreground pb-1.5">×</span>
          <label className="flex flex-col gap-1 text-xs">
            {t('editor.tableMenu.cols')}
            <input
              type="number"
              min={1}
              max={MAX_SIZE}
              value={cols}
              onChange={(e) => setCols(clamp(Number(e.target.value)))}
              className="border-input bg-background h-8 w-16 rounded-md border px-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => onInsert(rows, cols)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 ml-auto h-8 rounded-md px-3 text-sm font-medium"
          >
            {t('editor.tableMenu.insertButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tablo içindeyken: satır, sütun, hücre ve tablo işlemleri. */
type ActionKey =
  | 'rowAbove'
  | 'rowBelow'
  | 'deleteRow'
  | 'colLeft'
  | 'colRight'
  | 'deleteCol'
  | 'merge'
  | 'split'
  | 'headerRow'
  | 'headerCol'
  | 'deleteTable';

/** Tablo araçlarının etkin olup olmadığı ve imleçteki hücrenin rengi. */
interface TableState {
  addRowBefore: boolean;
  addRowAfter: boolean;
  deleteRow: boolean;
  addColumnBefore: boolean;
  addColumnAfter: boolean;
  deleteColumn: boolean;
  mergeCells: boolean;
  splitCell: boolean;
  toggleHeaderRow: boolean;
  toggleHeaderColumn: boolean;
  deleteTable: boolean;
  color: string | null;
}

function TableTools({
  editor,
  state,
  onDone,
}: {
  editor: Editor;
  state: TableState;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const chain = () => editor.chain().focus();
  const can = state;
  const current = state.color;

  const action = (
    key: ActionKey,
    icon: ReactNode,
    run: () => void,
    enabled = true,
    danger = false,
  ) => (
    <button
      key={key}
      type="button"
      disabled={!enabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        'hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:pointer-events-none disabled:opacity-40',
        danger && 'text-destructive hover:bg-destructive/10',
      )}
    >
      <span className="text-muted-foreground flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      {t(`editor.tableMenu.${key}`)}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1">
        <Group title={t('editor.tableMenu.rowsTitle')}>
          {action(
            'rowAbove',
            <ArrowUpToLine className="size-4" />,
            () => chain().addRowBefore().run(),
            can.addRowBefore,
          )}
          {action(
            'rowBelow',
            <ArrowDownToLine className="size-4" />,
            () => chain().addRowAfter().run(),
            can.addRowAfter,
          )}
          {action(
            'deleteRow',
            <Rows3 className="size-4" />,
            () => chain().deleteRow().run(),
            can.deleteRow,
          )}
        </Group>
        <Group title={t('editor.tableMenu.colsTitle')}>
          {action(
            'colLeft',
            <ArrowLeftToLine className="size-4" />,
            () => chain().addColumnBefore().run(),
            can.addColumnBefore,
          )}
          {action(
            'colRight',
            <ArrowRightToLine className="size-4" />,
            () => chain().addColumnAfter().run(),
            can.addColumnAfter,
          )}
          {action(
            'deleteCol',
            <Columns3 className="size-4" />,
            () => chain().deleteColumn().run(),
            can.deleteColumn,
          )}
        </Group>
      </div>
      <Group title={t('editor.tableMenu.cellsTitle')} columns={2}>
        {action(
          'merge',
          <Merge className="size-4" />,
          () => chain().mergeCells().run(),
          can.mergeCells,
        )}
        {action(
          'split',
          <Split className="size-4" />,
          () => chain().splitCell().run(),
          can.splitCell,
        )}
        {action(
          'headerRow',
          <PanelTop className="size-4" />,
          () => chain().toggleHeaderRow().run(),
          can.toggleHeaderRow,
        )}
        {action(
          'headerCol',
          <PanelLeft className="size-4" />,
          () => chain().toggleHeaderColumn().run(),
          can.toggleHeaderColumn,
        )}
      </Group>
      <div>
        <p className="text-muted-foreground mb-1 px-2 text-[11px] font-semibold tracking-wide uppercase">
          {t('editor.tableMenu.color')}
        </p>
        <div
          className="flex flex-wrap gap-1.5 px-2"
          role="radiogroup"
          aria-label={t('editor.tableMenu.color')}
        >
          {CELL_COLORS.map((color) => (
            <button
              key={color ?? 'none'}
              type="button"
              role="radio"
              aria-checked={current === color}
              aria-label={color ?? t('editor.tableMenu.noColor')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => chain().setCellAttribute('backgroundColor', color).run()}
              className={cn(
                'flex size-6 items-center justify-center rounded-md border',
                current === color && 'ring-primary ring-2 ring-offset-1',
              )}
              style={color ? { backgroundColor: color } : undefined}
            >
              {!color && <Ban className="text-muted-foreground size-3.5" />}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t pt-2">
        {action(
          'deleteTable',
          <Trash2 className="size-4" />,
          () => {
            chain().deleteTable().run();
            onDone();
          },
          can.deleteTable,
          true,
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  children,
  columns = 1,
}: {
  title: string;
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 px-2 text-[11px] font-semibold tracking-wide uppercase">
        {title}
      </p>
      <div className={cn('grid', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')}>{children}</div>
    </div>
  );
}
