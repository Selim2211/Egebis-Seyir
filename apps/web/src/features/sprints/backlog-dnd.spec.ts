import { describe, expect, it } from 'vitest';
import { BACKLOG_CONTAINER, containerId, resolveBacklogDrop } from './backlog-dnd';

const containers = [
  { sprintId: 's1', itemIds: ['a', 'b'] },
  { sprintId: 's2', itemIds: ['c'] },
  { sprintId: null, itemIds: ['d', 'e', 'f'] },
];
const drop = (activeId: string, overId: string | null, nestOn = false) =>
  resolveBacklogDrop({ activeId, overId, nestOn, containers });

describe('resolveBacklogDrop', () => {
  it('reorders within the backlog', () => {
    expect(drop('d', 'f')).toEqual({ kind: 'move', itemId: 'd', sprintId: null, afterId: 'f' });
    expect(drop('f', 'd')).toEqual({ kind: 'move', itemId: 'f', sprintId: null, afterId: null });
    expect(drop('e', 'e')).toBeNull();
  });

  it('moves backlog → sprint, sprint → sprint and sprint → backlog before the target row', () => {
    expect(drop('d', 'b')).toEqual({ kind: 'move', itemId: 'd', sprintId: 's1', afterId: 'a' });
    expect(drop('a', 'c')).toEqual({ kind: 'move', itemId: 'a', sprintId: 's2', afterId: null });
    expect(drop('c', 'e')).toEqual({ kind: 'move', itemId: 'c', sprintId: null, afterId: 'd' });
  });

  it('drops onto an empty area to append to that container', () => {
    expect(drop('d', containerId('s2'))).toEqual({
      kind: 'move',
      itemId: 'd',
      sprintId: 's2',
      afterId: 'c',
    });
    expect(drop('a', BACKLOG_CONTAINER)).toEqual({
      kind: 'move',
      itemId: 'a',
      sprintId: null,
      afterId: 'f',
    });
    expect(drop('a', containerId('s1'))).toBeNull();
  });

  it('nests when dropped onto the middle of a valid parent row', () => {
    expect(drop('d', 'e', true)).toEqual({ kind: 'nest', itemId: 'd', parentId: 'e' });
    expect(drop('d', 'a', true)).toEqual({ kind: 'nest', itemId: 'd', parentId: 'a' });
    expect(drop('d', 'd', true)).toBeNull();
  });

  it('detaches a sub-item dropped into a sprint or the backlog', () => {
    const sub = (overId: string, nestOn = false) =>
      resolveBacklogDrop({ activeId: 'x', overId, nestOn, containers, detach: true });
    expect(sub('b')).toEqual({ kind: 'unnest', itemId: 'x', sprintId: 's1', afterId: 'a' });
    expect(sub(BACKLOG_CONTAINER)).toEqual({
      kind: 'unnest',
      itemId: 'x',
      sprintId: null,
      afterId: 'f',
    });
    expect(sub('c', true)).toEqual({ kind: 'nest', itemId: 'x', parentId: 'c' });
  });

  it('ignores unknown targets', () => {
    expect(drop('d', null)).toBeNull();
    expect(drop('d', 'zzz')).toBeNull();
    expect(drop('zzz', 'd')).toBeNull();
  });
});
