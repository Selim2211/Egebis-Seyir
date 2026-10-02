import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@scrum/shared';
import { Prisma } from '../../generated/prisma/client';

export const notFound = () => new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
export const archivedParent = () => new ConflictException({ code: ERROR_CODES.CONTAINER_ARCHIVED });
export const keyTaken = () => new ConflictException({ code: ERROR_CODES.SPACE_KEY_TAKEN });
export const forbidden = (code: ErrorCode) => new ForbiddenException({ code });

/** Benzersizlik ihlali (eşzamanlı anahtar rezervasyonu vb.). */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
