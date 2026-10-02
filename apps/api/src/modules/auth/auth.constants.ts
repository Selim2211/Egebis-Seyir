import type { Request } from 'express';

export const SESSION_COOKIE = 'sm_session';
export const CSRF_COOKIE = 'sm_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const DAY = 24 * 60 * 60 * 1000;
/** "Beni hatırla" işaretliyse 30 gün, değilse 1 gün (ADR-038). */
export const SESSION_TTL = { remember: 30 * DAY, default: DAY } as const;
/** lastSeenAt en fazla dakikada bir güncellenir (her istekte yazma yapılmasın). */
export const SESSION_TOUCH_INTERVAL = 60 * 1000;

export const PASSWORD_RESET_TTL_MINUTES = 60;
export const INVITATION_TTL_DAYS = 7;

/** AuthGuard'ın isteğe eklediği kullanıcı. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  locale: string;
  sessionId: string;
}

export type AuthedRequest = Request & { user?: AuthUser };
