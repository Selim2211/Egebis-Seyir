import type { WorkItemRow } from '@scrum/shared';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { itemsToTsv } from './copy-list';

const t = ((key: string) => key.split('.').pop()) as unknown as TFunction;
const row = (over: Partial<WorkItemRow>) =>
  ({
    key: 'MOB-1',
    title: 'Giriş',
    type: 'STORY',
    status: { name: 'Yapılacak' },
    assignees: [{ name: 'Elif Demir' }, { name: 'Can Ak' }],
    priority: 'HIGH',
    points: 5,
    estimateHours: null,
    dueDate: '2026-10-20',
    ...over,
  }) as unknown as WorkItemRow;

describe('itemsToTsv', () => {
  it('writes a header and one tab-separated row per item', () => {
    const tsv = itemsToTsv(
      [
        row({}),
        row({
          key: 'MOB-2',
          type: 'TASK',
          points: null,
          estimateHours: 3,
          assignees: [],
          dueDate: null,
        }),
      ],
      t,
    );
    expect(tsv.split('\n')).toEqual([
      'key\ttitle\ttype\tstatus\tassignees\tpriority\testimate\tdue',
      'MOB-1\tGiriş\tSTORY\tYapılacak\tElif Demir, Can Ak\tHIGH\t5\t2026-10-20',
      'MOB-2\tGiriş\tTASK\tYapılacak\t\tHIGH\t3 h\t',
    ]);
  });

  it('flattens tabs and line breaks inside cells', () => {
    expect(itemsToTsv([row({ title: 'a\tb\nc' })], t).split('\n')[1]).toContain('\ta b c\t');
  });
});
