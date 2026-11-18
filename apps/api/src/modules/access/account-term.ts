import { accountTermDays, type WorkspaceRole } from '@scrum/shared';

const DAY = 86_400_000;

/** Üyelik kilitli mi: elle kilit ya da süreli hesabın (Dış kaynak/Guest) süresinin dolması (ADR-169). */
export const isMembershipLocked = (
  m: { lockedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean =>
  m.lockedAt !== null || (m.expiresAt !== null && m.expiresAt.getTime() <= now.getTime());

/** Yeni/rol değişen üyelik için bitiş anı; süresiz katmanda null. */
export function termEnd(tier: WorkspaceRole, from: Date = new Date()): Date | null {
  const days = accountTermDays(tier);
  return days === null ? null : new Date(from.getTime() + days * DAY);
}
