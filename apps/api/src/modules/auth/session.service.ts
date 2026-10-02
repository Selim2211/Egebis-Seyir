import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Session } from '@scrum/shared';
import type { CookieOptions, Request, Response } from 'express';
import { cookieSecure, type Env } from '../../infra/config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { generateToken, hashToken } from '../../infra/security/tokens';
import {
  type AuthUser,
  SESSION_COOKIE,
  SESSION_TOUCH_INTERVAL,
  SESSION_TTL,
} from './auth.constants';

type Db = Pick<PrismaService, 'session'>;

/** Sunucu tarafı oturumlar (ADR-010, ADR-038). */
@Injectable()
export class SessionService {
  private readonly secure: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secure = cookieSecure({
      COOKIE_SECURE: config.get('COOKIE_SECURE', { infer: true }),
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
    });
  }

  /** Oturum açar ve cookie'yi yazar. */
  async start(
    res: Response,
    req: Request,
    userId: string,
    remember: boolean,
    db: Db = this.prisma,
  ): Promise<void> {
    const token = generateToken();
    const ttl = remember ? SESSION_TTL.remember : SESSION_TTL.default;
    await db.session.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
        ip: req.ip ?? null,
        expiresAt: new Date(Date.now() + ttl),
      },
    });
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      ...(remember ? { maxAge: ttl } : {}),
    });
  }

  /** Cookie'deki token'ı doğrular; geçerliyse kullanıcıyı döndürür. */
  async authenticate(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true, locale: true } } },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;

    if (now - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }
    return { ...session.user, sessionId: session.id };
  }

  async end(res: Response, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  async list(userId: string, currentSessionId: string): Promise<Session[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }

  /** Kullanıcının bir oturumunu sonlandırır; başkasının oturumuna dokunamaz. */
  async revoke(userId: string, sessionId: string): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  /** Şifre değişince/sıfırlanınca diğer oturumlar kapatılır. */
  async revokeAll(userId: string, exceptSessionId?: string, db: Db = this.prisma): Promise<void> {
    await db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  cookieOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secure, path: '/' };
  }
}
