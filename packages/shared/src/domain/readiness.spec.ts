import { describe, expect, it } from 'vitest';
import { appliesToReadiness, normalizeChecked, readinessOf } from './readiness';

describe('readiness', () => {
  const items = ['Kod gözden geçirildi', 'Testler geçti', 'Dokümantasyon güncellendi'];

  it('yalnızca Story ve Bug için geçerli', () => {
    expect(appliesToReadiness('STORY')).toBe(true);
    expect(appliesToReadiness('BUG')).toBe(true);
    expect(appliesToReadiness('TASK')).toBe(false);
    expect(appliesToReadiness('EPIC')).toBe(false);
  });

  it('eksik maddeleri Space sırasıyla verir', () => {
    expect(readinessOf(items, ['Testler geçti'])).toEqual({
      total: 3,
      checked: 1,
      missing: ['Kod gözden geçirildi', 'Dokümantasyon güncellendi'],
    });
  });

  it("Space'ten kaldırılmış madde işareti sayılmaz", () => {
    expect(readinessOf(items, ['Eski madde', ...items]).checked).toBe(3);
    expect(readinessOf([], ['x'])).toEqual({ total: 0, checked: 0, missing: [] });
  });

  it('işaretleri Space maddeleriyle sınırlar, tekrarı atar ve sıralar', () => {
    expect(
      normalizeChecked(items, ['Testler geçti', 'Bilinmeyen', 'Testler geçti', items[0]!]),
    ).toEqual(['Kod gözden geçirildi', 'Testler geçti']);
  });
});
