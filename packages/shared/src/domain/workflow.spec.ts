import { describe, expect, it } from 'vitest';
import { checkWorkflow, MAX_STATUSES } from './workflow';

const cats = (...c: Array<'NOT_STARTED' | 'ACTIVE' | 'DONE'>) =>
  c.map((category) => ({ category }));

describe('checkWorkflow', () => {
  it('Done ve Done-dışı durum varsa geçerli', () => {
    expect(checkWorkflow(cats('NOT_STARTED', 'ACTIVE', 'DONE')).ok).toBe(true);
    expect(checkWorkflow(cats('ACTIVE', 'DONE')).ok).toBe(true);
  });
  it('Done yoksa, Done-dışı yoksa ya da ilk durum Done ise geçersiz', () => {
    for (const list of [cats('NOT_STARTED', 'ACTIVE'), cats('DONE'), cats('DONE', 'ACTIVE')]) {
      expect(checkWorkflow(list)).toEqual({ ok: false, code: 'STATUS_WORKFLOW_INVALID' });
    }
    expect(checkWorkflow([]).ok).toBe(false);
  });
  it(`en çok ${MAX_STATUSES} durum`, () => {
    const many = [
      ...cats('NOT_STARTED'),
      ...Array.from({ length: MAX_STATUSES }, () => ({ category: 'DONE' as const })),
    ];
    expect(checkWorkflow(many)).toEqual({ ok: false, code: 'STATUS_LIMIT' });
  });
});
