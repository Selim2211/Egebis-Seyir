import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ERROR_CODES,
  type Permission,
  type SpacePermission,
  type WorkspaceRole,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { safeEqual } from '../../infra/security/tokens';
import { type AuthedRequest, CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from './auth.constants';
import { SpaceAccessService } from '../access/space-access.service';
import { IS_PUBLIC, REQUIRED_PERMISSION, REQUIRED_SPACE_PERMISSION } from './decorators';
import { SessionService } from './session.service';

const cookie = (req: AuthedRequest, name: string): string | undefined => {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/** 1) Oturum: cookie → kullanıcı. @Public olmayan uçlarda oturum zorunlu. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = cookie(req, SESSION_COOKIE);
    const user = token ? await this.sessions.authenticate(token) : null;
    if (user) {
      req.user = user;
      this.cls.set('userId', user.id);
      this.cls.set('sessionId', user.sessionId);
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!isPublic && !user) throw new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED });
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 2) CSRF (double-submit, ADR-038): durum değiştiren isteklerde başlık = cookie olmalı. */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    const expected = cookie(req, CSRF_COOKIE);
    const provided = req.headers[CSRF_HEADER];
    if (!expected || typeof provided !== 'string' || !safeEqual(expected, provided)) {
      throw new ForbiddenException({ code: ERROR_CODES.CSRF_INVALID });
    }
    return true;
  }
}

/**
 * 3) Workspace erişimi: `:workspaceId` içeren rotalarda üyelik zorunlu.
 * Üye olmayan için workspace hiç yokmuş gibi 404 döner (varlığı sızdırılmaz).
 */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const workspaceId = req.params?.workspaceId;
    if (typeof workspaceId !== 'string') return true;
    if (!req.user) throw new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED });

    const membership = /^[0-9a-f-]{36}$/i.test(workspaceId)
      ? await this.prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: req.user.id } },
          include: { role: { select: { key: true, permissions: true } } },
        })
      : null;
    if (!membership) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });

    this.cls.set('workspaceId', workspaceId);
    this.cls.set('workspaceRole', membership.role.key as WorkspaceRole);
    this.cls.set('permissions', membership.role.permissions);
    return true;
  }
}

/** 4) İzin: @RequirePermission ile işaretli uçlarda rolün izin setine bakılır. */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;
    const permissions = this.cls.get('permissions');
    if (!permissions) {
      // İzin gerektiren her uç workspace kapsamında olmalı; değilse bu bir programlama hatasıdır.
      throw new HttpException({ code: ERROR_CODES.INTERNAL }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (!permissions.includes(required))
      throw new ForbiddenException({ code: ERROR_CODES.FORBIDDEN });
    return true;
  }
}

/**
 * 5) Space izni (ADR-039): @RequireSpacePermission ile işaretli uçlarda Space rota
 * parametresinden çözülür. Görünmeyen Space için 404, izin yoksa 403.
 */
@Injectable()
export class SpacePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
    private readonly spaces: SpaceAccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SpacePermission | undefined>(
      REQUIRED_SPACE_PERMISSION,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true;
    if (!this.cls.get('workspaceId')) {
      throw new HttpException({ code: ERROR_CODES.INTERNAL }, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const spaceId = await this.spaces.resolveSpaceId(req.params);
    const permissions = spaceId ? await this.spaces.permissionsIn(spaceId) : null;
    if (!spaceId || !permissions) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });

    this.cls.set('spaceId', spaceId);
    this.cls.set('spacePermissions', permissions);
    if (!permissions.includes(required)) {
      throw new ForbiddenException({ code: ERROR_CODES.FORBIDDEN });
    }
    return true;
  }
}
