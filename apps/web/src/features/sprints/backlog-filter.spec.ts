import type { WorkItemRow } from '@scrum/shared';
import { describe, expect, it } from 'vitest';
import { filterBacklog, isFiltered, isUnestimated, NO_FILTER } from './backlog-filter';

const row = (over: Partial<WorkItemRow>): WorkItemRow =>
  ({
    id: over.key ?? 'x',
    key: 'MOB-1',
    type: 'STORY',
    title: 'Giriş ekranı',
    parentId: null,
    points: null,
    ...over,
  }) as WorkItemRow;

const items = [
  row({ key: 'MOB-1', title: 'Giriş ekranı', points: 5, parentId: 'e1' }),
  row({ key: 'MOB-2', title: 'İade akışı', parentId: 'e2' }),
  row({ key: 'MOB-3', title: 'Çıkış', type: 'TASK' }),
  row({ key: 'MOB-4', title: 'Kayıt hatası', type: 'BUG' }),
];

const keys = (list: WorkItemRow[]) => list.map((i) => i.key);

describe('filterBacklog', () => {
  it('süzgeç yoksa hepsini ve sırayı korur', () => {
    expect(keys(filterBacklog(items, NO_FILTER))).toEqual(['MOB-1', 'MOB-2', 'MOB-3', 'MOB-4']);
    expect(isFiltered(NO_FILTER)).toBe(false);
  });

  it('başlık ve kimlikte arar; Türkçe büyük/küçük harf duyarsız', () => {
    expect(keys(filterBacklog(items, { ...NO_FILTER, q: 'iade' }))).toEqual(['MOB-2']);
    expect(keys(filterBacklog(items, { ...NO_FILTER, q: 'İADE' }))).toEqual(['MOB-2']);
    expect(keys(filterBacklog(items, { ...NO_FILTER, q: 'mob-3' }))).toEqual(['MOB-3']);
  });

  it("Epic'e göre ve Epic'sizleri süzer", () => {
    expect(keys(filterBacklog(items, { ...NO_FILTER, epic: 'e1' }))).toEqual(['MOB-1']);
    expect(keys(filterBacklog(items, { ...NO_FILTER, epic: 'none' }))).toEqual(['MOB-3', 'MOB-4']);
  });

  it('tahminsiz: puansız Story/Bug; Task sayılmaz', () => {
    expect(keys(filterBacklog(items, { ...NO_FILTER, unestimated: true }))).toEqual([
      'MOB-2',
      'MOB-4',
    ]);
    expect(isUnestimated(items[2]!)).toBe(false);
  });
});
