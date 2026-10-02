/**
 * API hata kodları (ADR-007). API metin değil kod döner; kullanıcıya gösterilen
 * mesaj web tarafında i18n ile üretilir.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  WORK_ITEM_PARENT_REQUIRED: 'WORK_ITEM_PARENT_REQUIRED',
  WORK_ITEM_PARENT_NOT_ALLOWED: 'WORK_ITEM_PARENT_NOT_ALLOWED',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
