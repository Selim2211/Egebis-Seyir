import { describe, expect, it } from 'vitest';
import { suggestSprint, toSprintBody, validateSprint } from './sprint-form-model';

describe('suggestSprint', () => {
  it('ilk sprint bugünden başlar ve Space süresi kadar sürer', () => {
    expect(suggestSprint([], '2026-10-05', 2)).toMatchObject({
      name: 'Sprint 1',
      startDate: '2026-10-05',
      endDate: '2026-10-18',
    });
  });

  it('sonraki sprint öncekinin bittiği günün ertesinde başlar', () => {
    const next = suggestSprint(
      [{ endDate: '2026-10-18' }, { endDate: '2026-10-04' }],
      '2026-10-05',
      1,
    );
    expect(next).toMatchObject({
      name: 'Sprint 3',
      startDate: '2026-10-19',
      endDate: '2026-10-25',
    });
  });

  it('geçmişte biten sprintlerden sonra bugünden başlar', () => {
    expect(suggestSprint([{ endDate: '2026-09-01' }], '2026-10-05', 2).startDate).toBe(
      '2026-10-05',
    );
  });
});

describe('validateSprint', () => {
  const ok = {
    name: 'S',
    goal: '',
    startDate: '2026-10-05',
    endDate: '2026-10-18',
    capacityNote: '',
  };

  it('geçerli form hatasızdır', () => {
    expect(validateSprint(ok)).toEqual({});
  });

  it('boş ad ve ters tarih yakalanır', () => {
    expect(validateSprint({ ...ok, name: '  ' })).toEqual({ name: 'required' });
    expect(validateSprint({ ...ok, endDate: '2026-10-01' })).toEqual({
      endDate: 'END_BEFORE_START',
    });
    expect(validateSprint({ ...ok, endDate: '2027-01-01' })).toEqual({ endDate: 'TOO_LONG' });
  });
});

describe('toSprintBody', () => {
  it('boş hedef ve notu null yapar', () => {
    expect(
      toSprintBody({
        name: ' S ',
        goal: ' ',
        startDate: '2026-10-05',
        endDate: '2026-10-18',
        capacityNote: '',
      }),
    ).toEqual({
      name: 'S',
      goal: null,
      startDate: '2026-10-05',
      endDate: '2026-10-18',
      capacityNote: null,
    });
  });
});
