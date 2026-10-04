import type { WorkItemSummary } from '@scrum/shared';
import { describe, expect, it } from 'vitest';
import { buildBoard, columnTotals, epicOf, type BoardStatus } from './board-model';

const statuses: BoardStatus[] = [
  { id: 's1', name: 'Yapılacak', color: '#aaa', category: 'NOT_STARTED' },
  { id: 's2', name: 'Devam ediyor', color: '#bbb', category: 'ACTIVE' },
  { id: 's3', name: 'Tamamlandı', color: '#ccc', category: 'DONE' },
];

const user = (id: string, name: string) => ({ id, name, avatarVersion: null });

let n = 0;
const item = (over: Partial<WorkItemSummary>): WorkItemSummary => ({
  id: `i${++n}`,
  key: `MOB-${n}`,
  type: 'STORY',
  title: 'T',
  listId: 'l',
  parentId: null,
  sprintId: null,
  statusId: 's1',
  priority: 'NORMAL',
  assignees: [],
  labelIds: [],
  points: null,
  estimateHours: null,
  startDate: null,
  dueDate: null,
  completedAt: null,
  childCount: 0,
  customFields: {},
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const ids = (list: WorkItemSummary[] | undefined) => list?.map((i) => i.id);

describe('buildBoard', () => {
  const items = [
    item({ id: 'a', statusId: 's1', points: 5, assignees: [user('u2', 'Zeynep')] }),
    item({
      id: 'b',
      statusId: 's2',
      points: 3,
      priority: 'URGENT',
      assignees: [user('u1', 'Ali')],
    }),
    item({ id: 'c', statusId: 's2' }),
    item({ id: 'd', statusId: 's3', points: 2, assignees: [user('u1', 'Ali')] }),
  ];

  it('satırsız: tek satır, kartlar durum sütunlarına girdi sırasıyla dağılır', () => {
    const [lane, ...rest] = buildBoard(items, statuses, 'none', new Map());
    expect(rest).toHaveLength(0);
    expect(lane!.kind).toBe('all');
    expect(ids(lane!.cells.get('s1'))).toEqual(['a']);
    expect(ids(lane!.cells.get('s2'))).toEqual(['b', 'c']);
    expect(ids(lane!.cells.get('s3'))).toEqual(['d']);
  });

  it('boş Board da sütunlarını gösterir', () => {
    const [lane] = buildBoard([], statuses, 'none', new Map());
    expect([...lane!.cells.keys()]).toEqual(['s1', 's2', 's3']);
  });

  it('atanana göre: ada göre sıralı, atanmamışlar sonda', () => {
    const lanes = buildBoard(items, statuses, 'assignee', new Map());
    expect(lanes.map((l) => (l.kind === 'assignee' ? l.title : l.kind))).toEqual([
      'Ali',
      'Zeynep',
      'unassigned',
    ]);
    expect(lanes[0]!.count).toBe(2);
  });

  it('önceliğe göre: acilden düşüğe, boş satırlar yok', () => {
    const lanes = buildBoard(items, statuses, 'priority', new Map());
    expect(lanes.map((l) => l.priority)).toEqual(['URGENT', 'NORMAL']);
  });

  it("Epic'e göre: üst Story'den Epic bulunur, Epic'siz sonda", () => {
    const epics = new Map([['e1', 'Ödeme']]);
    const tree = [
      item({ id: 'st', parentId: 'e1' }),
      item({ id: 'tk', type: 'TASK', parentId: 'st' }),
      item({ id: 'solo' }),
    ];
    const lanes = buildBoard(tree, statuses, 'epic', epics);
    expect(lanes.map((l) => l.kind)).toEqual(['epic', 'noEpic']);
    expect(lanes[0]!.title).toBe('Ödeme');
    expect(ids(lanes[0]!.cells.get('s1'))).toEqual(['st', 'tk']);
  });

  it('bilinmeyen durumdaki kart ilk sütuna düşer', () => {
    const [lane] = buildBoard(
      [item({ id: 'x', statusId: 'silinmis' })],
      statuses,
      'none',
      new Map(),
    );
    expect(ids(lane!.cells.get('s1'))).toEqual(['x']);
  });
});

describe('epicOf', () => {
  it('listedeki Epic atası öncelikli; Epic kendi Epic’i değildir', () => {
    const epic = item({ id: 'ep', type: 'EPIC' });
    const story = item({ id: 'st', parentId: 'ep' });
    const byId = new Map([epic, story].map((i) => [i.id, i]));
    expect(epicOf(story, byId, new Map())).toBe('ep');
    expect(epicOf(epic, byId, new Map())).toBeNull();
  });
});

describe('columnTotals', () => {
  it('tüm satırlardaki kart ve puanı toplar', () => {
    const lanes = buildBoard(
      [item({ id: 'a', statusId: 's2', points: 3 }), item({ id: 'b', statusId: 's2', points: 2 })],
      statuses,
      'none',
      new Map(),
    );
    expect(columnTotals(lanes, 's2')).toEqual({ count: 2, points: 5 });
    expect(columnTotals(lanes, 's1')).toEqual({ count: 0, points: 0 });
  });
});
