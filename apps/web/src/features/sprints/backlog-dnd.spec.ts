import { describe, expect, it } from 'vitest';
import { BACKLOG_CONTAINER, containerId, NEST_OFFSET_PX, resolveBacklogDrop } from './backlog-dnd';

const containers = [
  { sprintId: 's1', itemIds: ['a', 'b'] },
  { sprintId: 's2', itemIds: ['c'] },
  { sprintId: null, itemIds: ['d', 'e', 'f'] },
];
const drop = (activeId: string, overId: string | null, deltaX = 0) =>
  resolveBacklogDrop({ activeId, overId, deltaX, containers });

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

  it('nests when dragged right over another row', () => {
    expect(drop('d', 'e', NEST_OFFSET_PX)).toEqual({ kind: 'nest', itemId: 'd', parentId: 'e' });
    expect(drop('d', 'a', NEST_OFFSET_PX + 10)).toEqual({
      kind: 'nest',
      itemId: 'd',
      parentId: 'a',
    });
    expect(drop('d', 'd', NEST_OFFSET_PX)).toBeNull();
  });

  it('ignores unknown targets', () => {
    expect(drop('d', null)).toBeNull();
    expect(drop('d', 'zzz')).toBeNull();
    expect(drop('zzz', 'd')).toBeNull();
  });
});
