import type { Priority, WorkItemType } from '../constants/work-item';

/** CSV içe aktarma sınırları (ADR-085). */
export const IMPORT_LIMITS = { maxRows: 500, maxBytes: 5_000_000, maxIssues: 100 } as const;

/** Eşlenebilir hedef alanlar; özel alanlar `cf:<alanId>` ile eklenir. */
export const IMPORT_FIELDS = [
  'title',
  'type',
  'status',
  'priority',
  'assignees',
  'labels',
  'points',
  'estimateHours',
  'startDate',
  'dueDate',
  'parent',
  'description',
  'externalId',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Hedef alan (veya `cf:<id>`) → CSV başlığı; eşlenmeyen alan null/yok. */
export type ImportMapping = Record<string, string | null>;

const DELIMITERS = [',', ';', '\t'] as const;

/** Başlık satırındaki (tırnak dışı) en sık ayırıcıyı seçer. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let inQuotes = false;
    let count = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === delimiter) count += 1;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * CSV ayrıştırıcı (RFC 4180): tırnaklı alanlar, çift tırnak kaçışı, tırnak içinde satır sonu, CRLF/LF,
 * UTF-8 BOM ve `,` `;` sekme ayırıcıları. Tamamen boş satırlar atılır. Dışa aktarmadaki formül
 * koruması (`'=…`) geri alınır.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '' && !quoted) {
      inQuotes = true;
      quoted = true;
    } else if (ch === delimiter) endField();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
    } else if (ch === '\n') endRow();
    else field += ch;
  }
  if (field !== '' || row.length > 0 || quoted) endRow();

  return rows.map((r) => r.map((cell) => cell.replace(/^'(?=[=+\-@])/, '')));
}

const fold = (text: string) =>
  text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  title: ['title', 'baslik', 'name', 'ad', 'summary', 'ozet', 'task name', 'gorev adi'],
  type: ['type', 'tip', 'tur', 'issue type', 'work item type'],
  status: ['status', 'durum', 'state'],
  priority: ['priority', 'oncelik'],
  assignees: ['assignee', 'assignees', 'atanan', 'atananlar', 'assigned to'],
  labels: ['labels', 'label', 'etiket', 'etiketler', 'tags'],
  points: ['points', 'story points', 'puan', 'story point'],
  estimateHours: ['estimate hours', 'estimate', 'tahmin', 'saat', 'time estimate'],
  startDate: ['start date', 'start', 'baslangic', 'baslangic tarihi'],
  dueDate: ['due date', 'due', 'bitis', 'bitis tarihi', 'deadline'],
  parent: ['parent', 'parent key', 'ust', 'ust oge', 'parent id'],
  description: ['description', 'aciklama'],
  externalId: ['id', 'key', 'external id', 'externalid', 'issue key', 'task id'],
};

/**
 * Başlıklardan otomatik eşleme: bilinen eş anlamlılar (TR/EN) ve özel alan adları. Aynı başlık yalnızca
 * bir hedefe atanır; eşleşmeyen hedef null kalır.
 */
export function suggestMapping(
  headers: readonly string[],
  customFields: ReadonlyArray<{ id: string; name: string }> = [],
): ImportMapping {
  const folded = headers.map(fold);
  const used = new Set<number>();
  const mapping: ImportMapping = {};
  const take = (target: string, names: readonly string[]) => {
    const index = folded.findIndex((h, i) => !used.has(i) && names.includes(h));
    mapping[target] = index === -1 ? null : headers[index]!;
    if (index !== -1) used.add(index);
  };
  for (const field of IMPORT_FIELDS) take(field, HEADER_SYNONYMS[field]);
  for (const field of customFields) take(`cf:${field.id}`, [fold(field.name)]);
  return mapping;
}

const TYPE_NAMES: Record<string, WorkItemType> = {
  epic: 'EPIC',
  story: 'STORY',
  hikaye: 'STORY',
  'user story': 'STORY',
  task: 'TASK',
  gorev: 'TASK',
  subtask: 'SUBTASK',
  'sub task': 'SUBTASK',
  'alt gorev': 'SUBTASK',
  bug: 'BUG',
  hata: 'BUG',
};

export function parseType(text: string): WorkItemType | null {
  return TYPE_NAMES[fold(text)] ?? null;
}

const PRIORITY_NAMES: Record<string, Priority> = {
  urgent: 'URGENT',
  acil: 'URGENT',
  critical: 'URGENT',
  kritik: 'URGENT',
  high: 'HIGH',
  yuksek: 'HIGH',
  normal: 'NORMAL',
  medium: 'NORMAL',
  orta: 'NORMAL',
  low: 'LOW',
  dusuk: 'LOW',
};

export function parsePriority(text: string): Priority | null {
  return PRIORITY_NAMES[fold(text)] ?? null;
}

/** `YYYY-MM-DD`, `G.A.YYYY` veya `G/A/YYYY` (gün önce); gerçek bir gün değilse null. */
export function parseImportDate(text: string): string | null {
  const value = text.trim();
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] as [
      number,
      number,
      number,
    ];
  } else {
    match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
    if (!match) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])] as [
      number,
      number,
      number,
    ];
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Ondalık ayırıcı `,` veya `.`; negatif/sonsuz/boş değer null. */
export function parseImportNumber(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (value === '' || !/^\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** `;`, `|` veya `,` ile ayrılmış listeyi tekrarsız ve kırpılmış döndürür. */
export function splitImportList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[;|,]/)
        .map((part) => part.trim())
        .filter((part) => part !== ''),
    ),
  ];
}

export interface ImportTable {
  headers: string[];
  rows: string[][];
}

/** İlk satır başlık; veri satırları başlık sayısına tamamlanır/kırpılır. */
export function toImportTable(grid: string[][]): ImportTable {
  const [headers = [], ...rest] = grid;
  const cleanHeaders = headers.map((h) => h.trim());
  return {
    headers: cleanHeaders,
    rows: rest.map((row) => cleanHeaders.map((_, i) => row[i] ?? '')),
  };
}

/** Bir veri satırından hedef alanın ham metnini okur (eşleme yoksa/başlık bulunamazsa boş). */
export function cellFor(
  table: ImportTable,
  mapping: ImportMapping,
  row: readonly string[],
  target: string,
): string {
  const header = mapping[target];
  if (!header) return '';
  const index = table.headers.indexOf(header);
  return index === -1 ? '' : (row[index] ?? '').trim();
}
