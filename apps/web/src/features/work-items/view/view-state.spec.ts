import type { WorkItemSummary } from '@scrum/shared';
import { describe, expect, it } from 'vitest';
import { buildViewRows, itemsOf } from './view-rows';
import {
  activeFilterCount,
  dueBucket,
  filterItems,
  groupItems,
  isFlatView,
  sortItems,
  UNASSIGNED,
  type ViewContext,
} from './view-state';

const S = {
  todo: '00000000-0000-7000-8000-0000000000a1',
  doing: '00000000-0000-7000-8000-0000000000a2',
  done: '00000000-0000-7000-8000-0000000000a3',
};
const U = {
  ali: '00000000-0000-7000-8000-0000000000b1',
  veli: '00000000-0000-7000-8000-0000000000b2',
};
const ctx: ViewContext = {
  statuses: new Map([
    [S.todo, { name: 'Yapılacak', color: '#aaa', category: 'NOT_STARTED', order: 0 }],
    [S.doing, { name: 'Devam ediyor', color: '#bbb', category: 'ACTIVE', order: 1 }],
    [S.done, { name: 'Tamamlandı', color: '#ccc', category: 'DONE', order: 2 }],
  ]),
  labels: new Map([['l1', { name: 'acil' }]]),
  today: '2026-10-10',
};

let n = 0;
const item = (over: Partial<WorkItemSummary>): WorkItemSummary => ({
  id: `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`,
  key: `MOB-${n}`,
  type: 'TASK',
  title: `Öğe ${n}`,
  listId: '00000000-0000-7000-8000-0000000000ff',
  parentId: null,
  statusId: S.todo,
  priority: 'NORMAL',
  assignees: [],
  labelIds: [],
  points: null,
  estimateHours: null,
  startDate: null,
  dueDate: null,
  completedAt: null,
  childCount: 0,
  createdAt: `2026-10-0${(n % 9) + 1}T10:00:00.000Z`,
  ...over,
});

describe('süzgeçler', () => {
  const a = item({
    title: 'Ödeme ekranı',
    priority: 'HIGH',
    assignees: [{ id: U.ali, name: 'Ali', avatarVersion: null }],
  });
  const b = item({ title: 'Rapor', statusId: S.doing, labelIds: ['l1'] });
  const c = item({ title: 'ÇAĞRI merkezi', type: 'BUG', dueDate: '2026-10-01' });
  const all = [a, b, c];
  const run = (f: Parameters<typeof filterItems>[1]) =>
    filterItems(all, f, ctx).map((i) => i.title);

  it('metin: başlık ve kimlikte, Türkçe büyük/küçük harf duyarsız', () => {
    expect(run({ q: 'ödeme' })).toEqual(['Ödeme ekranı']);
    expect(run({ q: 'çağrı' })).toEqual(['ÇAĞRI merkezi']);
    expect(run({ q: b.key.toLowerCase() })).toEqual(['Rapor']);
    expect(run({ q: '   ' })).toHaveLength(3);
  });

  it('süzgeçler VE, aynı süzgeçteki seçenekler VEYA', () => {
    expect(run({ status: [S.doing] })).toEqual(['Rapor']);
    expect(run({ status: [S.doing, S.todo] })).toHaveLength(3);
    expect(run({ priority: ['HIGH'], type: ['TASK'] })).toEqual(['Ödeme ekranı']);
    expect(run({ type: ['BUG'], priority: ['HIGH'] })).toEqual([]);
    expect(run({ label: ['l1'] })).toEqual(['Rapor']);
  });

  it('atanan: kişi veya atanmamış', () => {
    expect(run({ assignee: [U.ali] })).toEqual(['Ödeme ekranı']);
    expect(run({ assignee: [UNASSIGNED] })).toEqual(['Rapor', 'ÇAĞRI merkezi']);
    expect(run({ assignee: [UNASSIGNED, U.ali] })).toHaveLength(3);
  });

  it('bitiş: gecikmiş, bu hafta (gecikmiş dahil), tarihsiz; tamamlanan gecikmiş sayılmaz', () => {
    expect(run({ due: 'overdue' })).toEqual(['ÇAĞRI merkezi']);
    expect(run({ due: 'none' })).toEqual(['Ödeme ekranı', 'Rapor']);
    const finished = item({ statusId: S.done, dueDate: '2026-09-01' });
    expect(filterItems([finished], { due: 'overdue' }, ctx)).toEqual([]);
    const soon = item({ dueDate: '2026-10-15' });
    expect(filterItems([soon], { due: 'week' }, ctx)).toEqual([soon]);
    const later = item({ dueDate: '2026-12-01' });
    expect(filterItems([later], { due: 'week' }, ctx)).toEqual([]);
  });
});

describe('dueBucket', () => {
  it('kovalar', () => {
    const at = (day: string | null, status = S.todo) =>
      dueBucket(
        item({ dueDate: day, statusId: status }),
        ctx.statuses.get(status)!.category,
        ctx.today,
      );
    expect(at(null)).toBe('none');
    expect(at('2026-10-09')).toBe('overdue');
    expect(at('2026-10-10')).toBe('today');
    expect(at('2026-10-17')).toBe('week');
    expect(at('2026-10-18')).toBe('later');
    expect(at('2026-10-09', S.done)).toBe('later');
  });
});

describe('sıralama', () => {
  const x = item({ title: 'b', priority: 'LOW', dueDate: '2026-10-20', points: 5 });
  const y = item({ title: 'a', priority: 'URGENT', dueDate: null });
  const z = item({ title: 'c', priority: 'HIGH', dueDate: '2026-10-12', estimateHours: 2 });
  const titles = (sort: Parameters<typeof sortItems>[1], dir: 'asc' | 'desc') =>
    sortItems([x, y, z], sort, dir, ctx).map((i) => i.title);

  it('manuel sıra değişmez', () => expect(titles('manual', 'desc')).toEqual(['b', 'a', 'c']));
  it('başlık', () => {
    expect(titles('title', 'asc')).toEqual(['a', 'b', 'c']);
    expect(titles('title', 'desc')).toEqual(['c', 'b', 'a']);
  });
  it('öncelik: acil önce', () => expect(titles('priority', 'asc')).toEqual(['a', 'c', 'b']));
  it('boş değerler her yönde sonda', () => {
    expect(titles('due', 'asc')).toEqual(['c', 'b', 'a']);
    expect(titles('due', 'desc')).toEqual(['b', 'c', 'a']);
  });
  it('tahmin: puan veya saat', () => expect(titles('estimate', 'asc')).toEqual(['c', 'b', 'a']));
  it('kimlikte sayısal sıra', () => {
    const k2 = item({ key: 'MOB-2' });
    const k10 = item({ key: 'MOB-10' });
    expect(sortItems([k10, k2], 'key', 'asc', ctx).map((i) => i.key)).toEqual(['MOB-2', 'MOB-10']);
  });
});

describe('gruplama', () => {
  const a = item({
    statusId: S.doing,
    priority: 'LOW',
    assignees: [{ id: U.veli, name: 'Veli', avatarVersion: null }],
  });
  const b = item({
    statusId: S.todo,
    priority: 'URGENT',
    assignees: [
      { id: U.ali, name: 'Ali', avatarVersion: null },
      { id: U.veli, name: 'Veli', avatarVersion: null },
    ],
  });
  const c = item({ statusId: S.todo });

  it('duruma göre: akış sırasında, boş gruplar yok', () => {
    const groups = groupItems([a, b, c], 'status', ctx);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Yapılacak', 2],
      ['Devam ediyor', 1],
    ]);
  });

  it('önceliğe göre acil önce', () => {
    expect(groupItems([a, b, c], 'priority', ctx).map((g) => g.id)).toEqual([
      'URGENT',
      'NORMAL',
      'LOW',
    ]);
  });

  it('atanana göre: çok atananlı öğe her kişinin altında, atanmamışlar sonda', () => {
    const groups = groupItems([a, b, c], 'assignee', ctx);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Ali', 1],
      ['Veli', 2],
      ['', 1],
    ]);
    expect(groups.at(-1)!.labelKey).toBe('detail.unassigned');
  });

  it('gruplama yoksa tek grup', () => {
    expect(groupItems([a, b], 'none', ctx)).toHaveLength(1);
  });
});

describe('görünüm satırları', () => {
  const parent = item({ title: 'P' });
  const child = item({ title: 'C', parentId: parent.id, type: 'SUBTASK' });
  const other = item({ title: 'O', statusId: S.doing });
  const items = [parent, child, other];
  const none = new Set<string>();

  it('süzgeç yokken hiyerarşik ağaç', () => {
    expect(isFlatView({})).toBe(false);
    const rows = buildViewRows(items, {}, ctx, none, none);
    expect(rows.map((r) => (r.kind === 'item' ? [r.item.title, r.depth] : 'g'))).toEqual([
      ['P', 0],
      ['C', 1],
      ['O', 0],
    ]);
  });

  it('süzgeç varken düz liste', () => {
    expect(isFlatView({ status: [S.todo] })).toBe(true);
    const rows = buildViewRows(items, { status: [S.todo] }, ctx, none, none);
    expect(rows.map((r) => (r.kind === 'item' ? [r.item.title, r.depth] : 'g'))).toEqual([
      ['P', 0],
      ['C', 0],
    ]);
  });

  it('gruplu görünümde başlıklar ve daraltma', () => {
    const search = { group: 'status' as const };
    const open = buildViewRows(items, search, ctx, none, none);
    expect(open.map((r) => r.kind)).toEqual(['group', 'item', 'item', 'group', 'item']);
    const collapsed = buildViewRows(items, search, ctx, none, new Set([S.todo]));
    expect(collapsed.map((r) => r.kind)).toEqual(['group', 'group', 'item']);
    expect(itemsOf(open)).toHaveLength(3);
  });

  it('filtre sayısı: metin dahil, gruplama/sıralama hariç', () => {
    expect(activeFilterCount({ q: 'x', status: [S.todo], group: 'status', sort: 'title' })).toBe(2);
    expect(activeFilterCount({})).toBe(0);
  });
});
