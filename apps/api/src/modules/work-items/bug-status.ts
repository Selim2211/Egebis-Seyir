import type { BugStatus, StatusCategory } from '@scrum/shared';

/** Pano durum kategorisi ve atanandan Bug durumu (ADR-117). */
export function bugStatusFor(category: StatusCategory, assigned: boolean): BugStatus {
  if (category === 'DONE') return 'RESOLVED';
  if (category === 'ACTIVE') return 'IN_PROGRESS';
  return assigned ? 'ASSIGNED' : 'UNASSIGNED';
}
