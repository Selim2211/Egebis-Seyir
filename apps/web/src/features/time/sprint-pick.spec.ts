import { describe, expect, it } from 'vitest';
import { latestSprint, sprintChoices } from './sprint-pick';

const sp = (id: string, status: string, startDate: string) => ({
  id,
  name: `Sprint ${id}`,
  status,
  startDate,
});
const all = [
  sp('1', 'COMPLETED', '2026-08-01'),
  sp('2', 'COMPLETED', '2026-08-15'),
  sp('3', 'ACTIVE', '2026-09-01'),
  sp('4', 'PLANNED', '2026-09-15'),
  sp('5', 'PLANNED', '2026-10-01'),
  sp('x', 'CANCELLED', '2026-09-20'),
];

describe('iş yükü sprint seçimi', () => {
  it('varsayılan: aktif, yoksa son tamamlanan, yoksa ilk planlanan', () => {
    expect(latestSprint(all)?.id).toBe('3');
    expect(latestSprint(all.filter((s) => s.status !== 'ACTIVE'))?.id).toBe('2');
    expect(
      latestSprint([sp('5', 'PLANNED', '2026-10-01'), sp('4', 'PLANNED', '2026-09-15')])?.id,
    ).toBe('4');
    expect(latestSprint([])).toBeNull();
  });

  it('arama boşken son 3 sprint (en yeni önce, iptal hariç); yazınca hepsinde arar', () => {
    expect(sprintChoices(all, '').map((s) => s.id)).toEqual(['5', '4', '3']);
    expect(sprintChoices(all, 'sprint 1').map((s) => s.id)).toEqual(['1']);
    expect(sprintChoices(all, 'SPRINT').map((s) => s.id)).toEqual(['5', '4', '3', '2', '1']);
  });
});
