import { describe, expect, it } from 'vitest';
import { WORK_ITEM_TYPES, type WorkItemType } from '../constants/work-item';
import { checkParent } from './hierarchy';

// Brief §6.2.1: Story → Epic veya bağımsız; Task → Story veya bağımsız;
// Sub-task → Task/Story/Bug altında; Bug bağımsız veya Story/Epic'e bağlı.
const allowed: Array<[WorkItemType, WorkItemType | null]> = [
  ['EPIC', null],
  ['STORY', null],
  ['STORY', 'EPIC'],
  ['TASK', null],
  ['TASK', 'STORY'],
  ['SUBTASK', 'TASK'],
  ['SUBTASK', 'STORY'],
  ['SUBTASK', 'BUG'],
  ['BUG', null],
  ['BUG', 'STORY'],
  ['BUG', 'EPIC'],
];

describe('checkParent', () => {
  it.each(allowed)('%s → %s izinli', (child, parent) => {
    expect(checkParent(child, parent)).toEqual({ ok: true });
  });

  it('Sub-task üst öğesiz olamaz', () => {
    expect(checkParent('SUBTASK', null)).toEqual({
      ok: false,
      code: 'WORK_ITEM_PARENT_REQUIRED',
    });
  });

  it('listede olmayan tüm kombinasyonlar reddedilir', () => {
    const isAllowed = (c: WorkItemType, p: WorkItemType) =>
      allowed.some(([ac, ap]) => ac === c && ap === p);

    for (const child of WORK_ITEM_TYPES) {
      for (const parent of WORK_ITEM_TYPES) {
        if (isAllowed(child, parent)) continue;
        expect(checkParent(child, parent), `${child} → ${parent}`).toEqual({
          ok: false,
          code: 'WORK_ITEM_PARENT_NOT_ALLOWED',
        });
      }
    }
  });

  it('Epic hiçbir öğenin altına giremez', () => {
    for (const parent of WORK_ITEM_TYPES) {
      expect(checkParent('EPIC', parent).ok).toBe(false);
    }
  });
});
