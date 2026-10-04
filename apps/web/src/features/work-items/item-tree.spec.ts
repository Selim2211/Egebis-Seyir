import type { WorkItemSummary } from '@scrum/shared';
import { describe, expect, it } from 'vitest';
import { buildRows } from './item-tree';

const base: Omit<WorkItemSummary, 'id' | 'key' | 'title' | 'parentId'> = {
  type: 'TASK',
  listId: '00000000-0000-7000-8000-000000000001',
  sprintId: null,
  statusId: '00000000-0000-7000-8000-000000000002',
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
  createdAt: '2026-10-02T10:00:00.000Z',
};

const item = (id: string, parentId: string | null = null): WorkItemSummary => ({
  ...base,
  id,
  key: `MOB-${id}`,
  title: id,
  parentId,
});

describe('buildRows', () => {
  const items = [item('a'), item('a1', 'a'), item('a2', 'a'), item('a1x', 'a1'), item('b')];

  it('hiyerarşiyi rank sırasını koruyarak düzleştirir', () => {
    expect(buildRows(items, new Set()).map((r) => [r.item.id, r.depth])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['a1x', 2],
      ['a2', 1],
      ['b', 0],
    ]);
  });

  it('daraltılan öğenin alt ağacı gizlenir; alt öğe sayısı korunur', () => {
    const rows = buildRows(items, new Set(['a']));
    expect(rows.map((r) => r.item.id)).toEqual(['a', 'b']);
    expect(rows[0]!.children).toBe(2);
  });

  it('üst öğesi listede olmayan öğe kök sayılır', () => {
    const rows = buildRows([item('x', 'baska-listede'), item('y')], new Set());
    expect(rows.map((r) => [r.item.id, r.depth])).toEqual([
      ['x', 0],
      ['y', 0],
    ]);
  });

  it('boş liste', () => expect(buildRows([], new Set())).toEqual([]));
});
