import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  API_TOKEN_PREFIX,
  type ApiToken,
  type ApiTokensResponse,
  type CreatedApiToken,
  type CreateApiTokenRequest,
  ERROR_CODES,
  MAX_API_TOKENS,
} from '@scrum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { generateToken, hashToken } from '../../infra/security/tokens';
import type { AuthUser } from './auth.constants';

const DAY = 24 * 60 * 60 * 1000;
/** lastUsedAt en fazla dakikada bir yazılır. */
const TOUCH_INTERVAL = 60 * 1000;

/** Kişisel API token'ları (Faz 6.1, ADR-086). */
@Injectable()
export class ApiTokensService {
  constructor(private readonly prisma: PrismaService) {}

  private toInfo(row: {
    id: string;
    name: string;
    prefix: string;
    readOnly: boolean;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  }): ApiToken {
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      readOnly: row.readOnly,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private active(userId: string) {
    return {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
  }

  async list(userId: string): Promise<ApiTokensResponse> {
    const rows = await this.prisma.apiToken.findMany({
      where: this.active(userId),
      orderBy: { createdAt: 'desc' },
    });
    return { tokens: rows.map((r) => this.toInfo(r)) };
  }

  async create(userId: string, input: CreateApiTokenRequest): Promise<CreatedApiToken> {
    const count = await this.prisma.apiToken.count({ where: this.active(userId) });
    if (count >= MAX_API_TOKENS) {
      throw new HttpException({ code: ERROR_CODES.API_TOKEN_LIMIT }, HttpStatus.CONFLICT);
    }
    const token = `${API_TOKEN_PREFIX}${generateToken()}`;
    const row = await this.prisma.apiToken.create({
      data: {
        userId,
        name: input.name.trim(),
        prefix: token.slice(0, API_TOKEN_PREFIX.length + 6),
        tokenHash: hashToken(token),
        readOnly: input.readOnly ?? false,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * DAY) : null,
      },
    });
    return { token, info: this.toInfo(row) };
  }

  async revoke(userId: string, tokenId: string): Promise<boolean> {
    const result = await this.prisma.apiToken.updateMany({
      where: { id: tokenId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Bearer token'ı doğrular; geçerliyse kullanıcıyı ve token bilgisini döndürür. */
  async authenticate(
    token: string,
  ): Promise<{ user: AuthUser; tokenId: string; readOnly: boolean } | null> {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null;
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, name: true, locale: true } } },
    });
    const now = Date.now();
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= now)) return null;
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_INTERVAL) {
      await this.prisma.apiToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      });
    }
    return {
      user: { ...row.user, sessionId: `api-token:${row.id}` },
      tokenId: row.id,
      readOnly: row.readOnly,
    };
  }
}
