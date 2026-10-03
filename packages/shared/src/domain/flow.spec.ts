import { describe, expect, it } from 'vitest';
import {
  categoryOn,
  countByWeek,
  cumulativeFlow,
  cycleStats,
  type FlowItem,
  weekStartOf,
  weeksBetween,
} from './flow';

const item = (over: Partial<FlowItem> & { id: string }): FlowItem => ({
  type: 'TASK',
  createdDay: '2026-10-05',
  completedDay: null,
  initialCategory: 'NOT_STARTED',
  transitions: [],
  ...over,
});

describe('categoryOn', () => {
  const it1 = item({
    id: '1',
    transitions: [
      { day: '2026-10-07', category: 'ACTIVE' },
      { day: '2026-10-09', category: 'DONE' },
    ],
  });
  it('oluşturulmadan önce null, sonra geçişleri izler', () => {
    expect(categoryOn(it1, '2026-10-04')).toBeNull();
    expect(categoryOn(it1, '2026-10-05')).toBe('NOT_STARTED');
    expect(categoryOn(it1, '2026-10-07')).toBe('ACTIVE');
    expect(categoryOn(it1, '2026-10-20')).toBe('DONE');
  });
});

describe('cumulativeFlow', () => {
  it('gün gün kategori sayılarını verir', () => {
    const flow = cumulativeFlow(
      [
        item({ id: '1', transitions: [{ day: '2026-10-06', category: 'ACTIVE' }] }),
        item({ id: '2', createdDay: '2026-10-06' }),
      ],
      '2026-10-05',
      '2026-10-07',
    );
    expect(flow.days).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(flow.notStarted).toEqual([1, 1, 1]);
    expect(flow.active).toEqual([0, 1, 1]);
    expect(flow.done).toEqual([0, 0, 0]);
  });
});

describe('haftalar', () => {
  it('Pazartesi başlangıcı ve aralık', () => {
    expect(weekStartOf('2026-10-07')).toBe('2026-10-05');
    expect(weekStartOf('2026-10-11')).toBe('2026-10-05');
    expect(weeksBetween('2026-10-07', '2026-10-20')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
  });

  it('olayları haftaya sayar, aralık dışını atar', () => {
    const counts = countByWeek(
      ['2026-10-05', '2026-10-06', '2026-10-13', null, '2026-12-01'],
      '2026-10-05',
      '2026-10-18',
    );
    expect(counts).toEqual([
      { weekStart: '2026-10-05', count: 2 },
      { weekStart: '2026-10-12', count: 1 },
    ]);
  });
});

describe('cycleStats', () => {
  it('lead ve cycle süresini ortalama, medyan ve P85 ile verir', () => {
    const items = [
      item({
        id: '1',
        createdDay: '2026-10-01',
        completedDay: '2026-10-11',
        transitions: [
          { day: '2026-10-05', category: 'ACTIVE' },
          { day: '2026-10-11', category: 'DONE' },
        ],
      }),
      item({
        id: '2',
        createdDay: '2026-10-02',
        completedDay: '2026-10-04',
        transitions: [
          { day: '2026-10-03', category: 'ACTIVE' },
          { day: '2026-10-04', category: 'DONE' },
        ],
      }),
      item({ id: '3', createdDay: '2026-10-03' }),
    ];
    const stats = cycleStats(items, '2026-10-01', '2026-10-31');
    expect(stats.sample).toBe(2);
    expect(stats.leadAvg).toBe(6);
    expect(stats.leadMedian).toBe(2);
    expect(stats.cycleAvg).toBe(3.5);
    expect(stats.cycleP85).toBe(6);
  });

  it('Active’e girmeden biten iş cycle 0; aralık dışı sayılmaz; veri yoksa null', () => {
    const quick = item({ id: '1', createdDay: '2026-10-01', completedDay: '2026-10-03' });
    expect(cycleStats([quick], '2026-10-01', '2026-10-31')).toMatchObject({
      sample: 1,
      leadAvg: 2,
      cycleAvg: 0,
    });
    expect(cycleStats([quick], '2026-11-01', '2026-11-30')).toEqual({
      sample: 0,
      leadAvg: null,
      leadMedian: null,
      cycleAvg: null,
      cycleMedian: null,
      cycleP85: null,
    });
  });
});
