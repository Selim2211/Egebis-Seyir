import { HttpStatus, Injectable, UnauthorizedException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, type Locale } from '@scrum/shared';
import type { Env } from '../../infra/config/env';
import { passwordResetMail } from '../../infra/mail/templates';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../infra/security/password';
import { generateToken, hashToken } from '../../infra/security/tokens';
import { PASSWORD_RESET_TTL_MINUTES } from './auth.constants';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /** E-posta/şifre doğrular. Kullanıcı yoksa da aynı sürede yanıt verir. */
  async verifyCredentials(email: string, password: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok) throw new UnauthorizedException({ code: ERROR_CODES.INVALID_CREDENTIALS });
    return user.id;
  }

  /** Kayıtlı e-postaya sıfırlama bağlantısı gönderir; kayıtlı değilse sessizce çıkar. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const token = generateToken();
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
      },
    });
    await this.mail.send(
      passwordResetMail({
        to: user.email,
        locale: user.locale as Locale,
        name: user.name,
        url: `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      }),
    );
  }

  /** Yeni şifreyi kaydeder; token tek kullanımlıktır ve kullanıcının tüm oturumları kapanır. */
  async resetPassword(token: string, password: string): Promise<void> {
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new HttpException({ code: ERROR_CODES.TOKEN_INVALID }, HttpStatus.BAD_REQUEST);
    }
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0)
        throw new HttpException({ code: ERROR_CODES.TOKEN_INVALID }, HttpStatus.BAD_REQUEST);
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await this.sessions.revokeAll(reset.userId, undefined, tx);
    });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    current: string,
    next: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(current, user.passwordHash))) {
      throw new HttpException(
        { code: ERROR_CODES.CURRENT_PASSWORD_INVALID },
        HttpStatus.BAD_REQUEST,
      );
    }
    const passwordHash = await hashPassword(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.sessions.revokeAll(userId, sessionId, tx);
    });
  }
}
