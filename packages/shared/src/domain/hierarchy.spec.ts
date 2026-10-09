import { describe, expect, it } from 'vitest';
import { WORK_ITEM_TYPES, type WorkItemType } from '../constants/work-item';
import { checkParent, planNest } from './hierarchy';

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

describe('planNest', () => {
  const leaf = (type: WorkItemType) => ({ type, hasChildren: false });

  it('keeps the type when the hierarchy already allows the parent', () => {
    expect(planNest(leaf('STORY'), 'EPIC')).toEqual({ ok: true, type: 'STORY' });
    expect(planNest(leaf('TASK'), 'STORY')).toEqual({ ok: true, type: 'TASK' });
    expect(planNest(leaf('BUG'), 'STORY')).toEqual({ ok: true, type: 'BUG' });
  });

  it('turns a childless Task into a Sub-task under a Task or Bug', () => {
    expect(planNest(leaf('TASK'), 'TASK')).toEqual({ ok: true, type: 'SUBTASK' });
    expect(planNest(leaf('TASK'), 'BUG')).toEqual({ ok: true, type: 'SUBTASK' });
  });

  it('refuses when the Task has its own sub-tasks or the types cannot nest', () => {
    expect(planNest({ type: 'TASK', hasChildren: true }, 'TASK').ok).toBe(false);
    expect(planNest(leaf('STORY'), 'STORY').ok).toBe(false);
    expect(planNest(leaf('EPIC'), 'STORY').ok).toBe(false);
    expect(planNest(leaf('BUG'), 'TASK').ok).toBe(false);
  });
});
