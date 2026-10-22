/** İş yükü sprint seçimi kuralları (ADR-132). */
interface SprintLike {
  id: string;
  name: string;
  status: string;
  startDate: string;
}

/** İptal edilenler hariç, başlangıcı en yeni olan önce. */
const byNewest = <T extends SprintLike>(sprints: readonly T[]) =>
  sprints
    .filter((s) => s.status !== 'CANCELLED')
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

/**
 * Varsayılan ("en son") sprint: aktif sprint varsa o; yoksa başlamış olanların en yenisi (tamamlanmış);
 * hiç başlamış yoksa ilk planlanan.
 */
export function latestSprint<T extends SprintLike>(sprints: readonly T[]): T | null {
  const active = sprints.find((s) => s.status === 'ACTIVE');
  if (active) return active;
  const newest = byNewest(sprints);
  const started = newest.find((s) => s.status === 'COMPLETED');
  if (started) return started;
  const planned = sprints
    .filter((s) => s.status === 'PLANNED')
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return planned[0] ?? null;
}

/** Arama boşken gösterilen son sprint'ler (en yeni önce); yazınca tüm sprint'lerde ada göre arar. */
export function sprintChoices<T extends SprintLike>(
  sprints: readonly T[],
  query: string,
  recent = 3,
): T[] {
  const q = query.trim().toLocaleLowerCase();
  const newest = byNewest(sprints);
  return q ? newest.filter((s) => s.name.toLocaleLowerCase().includes(q)) : newest.slice(0, recent);
}
