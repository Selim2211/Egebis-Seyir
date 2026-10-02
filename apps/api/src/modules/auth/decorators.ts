import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, SpacePermission } from '@scrum/shared';
import type { AuthedRequest, AuthUser } from './auth.constants';

export const IS_PUBLIC = 'auth:public';
/** Oturum gerektirmeyen uç. Oturum varsa yine de `req.user` doldurulur. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const AUTH_RATE_LIMITED = 'auth:rate-limited';
/** Kaba kuvvet denemelerine açık uçlar için sıkı oran sınırı (AUTH_RATE_LIMIT). */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMITED, true);

export const REQUIRED_PERMISSION = 'access:permission';
/** Workspace rotalarında gereken izin (ADR-011). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

export const REQUIRED_SPACE_PERMISSION = 'access:space-permission';
/**
 * Space kapsamındaki uçlarda gereken izin (ADR-039). Space, rota parametresinden
 * (`spaceId`, `folderId` veya `listId`) çözülür; görünmeyen Space 404 döner.
 */
export const RequireSpacePermission = (permission: SpacePermission) =>
  SetMetadata(REQUIRED_SPACE_PERMISSION, permission);

/** Oturum açmış kullanıcı (yalnızca @Public olmayan uçlarda kesin dolu). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user!;
});

/** @Public uçlarda isteğe bağlı kullanıcı. */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
