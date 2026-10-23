import { describe, expect, it } from 'vitest';
import { autoLayout, COLUMN_WIDTH, ROW_HEIGHT } from './map-layout';

const n = (id: string, type: string, parentId: string | null, key = `P-${id}`) =>
  ({ id, key, type, parentId }) as Parameters<typeof autoLayout>[0][number];

describe('autoLayout', () => {
  it('Epic solda, Task ortada, Sub-Task sağda; ebeveyn çocukların ortasında durur', () => {
    const pos = autoLayout([
      n('e', 'EPIC', null, 'P-1'),
      n('t1', 'TASK', 'e', 'P-2'),
      n('t2', 'TASK', 'e', 'P-3'),
      n('s', 'SUBTASK', 't1', 'P-4'),
    ]);
    expect(pos.e!.x).toBe(0);
    expect(pos.t1!.x).toBe(COLUMN_WIDTH);
    expect(pos.s!.x).toBe(COLUMN_WIDTH * 2);
    expect(pos.s!.y).toBe(0);
    expect(pos.t1!.y).toBe(0);
    expect(pos.t2!.y).toBe(ROW_HEIGHT);
    expect(pos.e!.y).toBe((pos.t1!.y + pos.t2!.y) / 2);
  });

  it('ebeveyni listede olmayan iş kök olur; kutular üst üste binmez', () => {
    const pos = autoLayout([n('a', 'TASK', 'gizli', 'P-1'), n('b', 'BUG', null, 'P-2')]);
    expect(pos.a!.x).toBe(0);
    expect(pos.b!.x).toBe(0);
    expect(Math.abs(pos.a!.y - pos.b!.y)).toBeGreaterThanOrEqual(ROW_HEIGHT);
  });

  it('döngü sonsuz döngüye girmez', () => {
    const pos = autoLayout([n('a', 'TASK', 'b'), n('b', 'TASK', 'a')]);
    expect(Object.keys(pos)).toEqual([]);
  });
});
