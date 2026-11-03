import { BadRequestException } from '@nestjs/common';
import { ERROR_CODES, RemoveMemberRequestSchema } from '@scrum/shared';

/** Çıkarma isteğinin gövdesi isteğe bağlıdır (gövdesiz DELETE = varsayılan devir, ADR-153). */
export function parseRemoveBody(body: unknown): Record<string, string> {
  const parsed = RemoveMemberRequestSchema.safeParse(body ?? {});
  if (!parsed.success) throw new BadRequestException({ code: ERROR_CODES.VALIDATION_FAILED });
  return parsed.data.reassign;
}
