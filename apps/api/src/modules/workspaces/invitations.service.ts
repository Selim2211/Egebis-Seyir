import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ERROR_CODES,
  type AcceptInvitationRequest,
  type Invitation,
  type InvitationPreview,
  type Locale,
  type WorkspaceRole,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import type { Env } from '../../infra/config/env';
import { MailService } from '../../infra/mail/mail.service';
import { invitationMail } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { hashPassword } from '../../infra/security/password';
import { generateToken, hashToken } from '../../infra/security/tokens';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';
import { type AuthUser, INVITATION_TTL_DAYS } from '../auth/auth.constants';

const DAY = 24 * 60 * 60 * 1000;
const pending = () => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } });

/** Davetle kayıt (ADR-034). Davet = kayıt bağlantısı; token tek kullanımlık ve süreli. */
@Injectable()
export class InvitationsService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  // ---------- Workspace yöneticisi tarafı (tenant kapsamlı) ----------

  async listPending(): Promise<Invitation[]> {
    const rows = await this.tenant.db.invitation.findMany({
      where: pending(),
      include: { role: { select: { key: true } }, invitedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role.key as WorkspaceRole,
      invitedBy: r.invitedBy.name,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  /** Davet gönderir. Aynı e-postaya bekleyen davet varsa yenisiyle değiştirilir. */
  async create(emails: string[], role: Exclude<WorkspaceRole, 'OWNER'>): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    const unique = [...new Set(emails)];

    const existing = await this.tenant.db.membership.findMany({
      where: { user: { email: { in: unique } } },
      select: { user: { select: { email: true } } },
    });
    if (existing.length > 0) {
      throw new ConflictException({
        code: ERROR_CODES.ALREADY_MEMBER,
        details: { emails: existing.map((m) => m.user.email) },
      });
    }

    const roleId = await this.access.workspaceRoleId(workspaceId, role);
    const mails = await this.tenant.db.$transaction(async (tx) => {
      const result: Array<{ email: string; token: string }> = [];
      for (const email of unique) {
        await tx.invitation.updateMany({
          where: { email, ...pending() },
          data: { revokedAt: new Date() },
        });
        const token = generateToken();
        const invitation = await tx.invitation.create({
          data: {
            workspaceId,
            email,
            roleId,
            tokenHash: hashToken(token),
            invitedById: actorId,
            expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * DAY),
          },
        });
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'invitation',
          entityId: invitation.id,
          action: 'invitation.created',
          changes: { email, role },
        });
        result.push({ email, token });
      }
      return result;
    });

    for (const { email, token } of mails) await this.sendMail(email, token, role);
  }

  /** Yeni token ve süre ile tekrar gönderir (eski bağlantı geçersizleşir). */
  async resend(invitationId: string): Promise<void> {
    const invitation = await this.tenant.db.invitation.findFirst({
      where: { id: invitationId, ...pending() },
      include: { role: { select: { key: true } } },
    });
    if (!invitation) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });

    const token = generateToken();
    await this.tenant.db.invitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * DAY),
      },
    });
    await this.sendMail(invitation.email, token, invitation.role.key as WorkspaceRole);
  }

  async revoke(invitationId: string): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    await this.tenant.db.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: invitationId, ...pending() },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
      await this.activity.record(tx, {
        workspaceId,
        actorId: this.cls.get('userId')!,
        entityType: 'invitation',
        entityId: invitationId,
        action: 'invitation.revoked',
      });
    });
  }

  // ---------- Davet edilen tarafı (token ile, tenant dışı) ----------

  async preview(token: string): Promise<InvitationPreview> {
    const inv = await this.findValid(token);
    const accountExists = (await this.prisma.user.count({ where: { email: inv.email } })) > 0;
    return {
      workspaceName: inv.workspace.name,
      invitedBy: inv.invitedBy.name,
      email: inv.email,
      role: inv.role.key as WorkspaceRole,
      expiresAt: inv.expiresAt.toISOString(),
      accountExists,
    };
  }

  /**
   * Daveti kabul eder. E-posta için hesap yoksa hesap oluşturulur (ad + şifre zorunlu);
   * varsa aynı e-postayla giriş yapılmış olmalıdır. Yeni hesabın kullanıcı id'si döner.
   */
  async accept(
    token: string,
    input: AcceptInvitationRequest,
    user: AuthUser | undefined,
  ): Promise<{ workspaceId: string; newUserId?: string }> {
    const inv = await this.findValid(token);
    const existing = await this.prisma.user.findUnique({ where: { email: inv.email } });

    if (existing) {
      if (!user) throw new UnauthorizedException({ code: ERROR_CODES.INVITE_REQUIRES_LOGIN });
      if (user.id !== existing.id)
        throw new ForbiddenException({ code: ERROR_CODES.INVITE_EMAIL_MISMATCH });
    } else if (!input.name || !input.password) {
      throw new HttpException({ code: ERROR_CODES.VALIDATION_FAILED }, HttpStatus.BAD_REQUEST);
    }

    const passwordHash = existing ? undefined : await hashPassword(input.password!);
    const newUserId = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.invitation.updateMany({
        where: { id: inv.id, ...pending() },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException({ code: ERROR_CODES.TOKEN_INVALID });

      const userId =
        existing?.id ??
        (
          await tx.user.create({
            data: {
              email: inv.email,
              name: input.name!,
              passwordHash: passwordHash!,
              locale: input.locale ?? 'tr',
            },
          })
        ).id;

      await tx.membership.upsert({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
        create: { workspaceId: inv.workspaceId, userId, roleId: inv.roleId },
        update: {},
      });
      await this.recordJoin(tx, inv.workspaceId, userId, inv.id);
      return existing ? undefined : userId;
    });

    return { workspaceId: inv.workspaceId, newUserId };
  }

  private async recordJoin(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
    invitationId: string,
  ) {
    await this.activity.record(tx, {
      workspaceId,
      actorId: userId,
      entityType: 'member',
      entityId: userId,
      action: 'member.joined',
      changes: { invitationId },
    });
  }

  private async findValid(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        workspace: { select: { name: true } },
        invitedBy: { select: { name: true } },
        role: { select: { key: true } },
      },
    });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date()) {
      throw new NotFoundException({ code: ERROR_CODES.TOKEN_INVALID });
    }
    return inv;
  }

  private async sendMail(email: string, token: string, role: WorkspaceRole): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const [workspace, inviter] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { name: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: this.cls.get('userId')! },
        select: { name: true, locale: true },
      }),
    ]);
    await this.mail.send(
      invitationMail({
        to: email,
        locale: inviter.locale as Locale,
        workspaceName: workspace.name,
        inviterName: inviter.name,
        role,
        url: `${this.appUrl}/invite/${encodeURIComponent(token)}`,
        expiresInDays: INVITATION_TTL_DAYS,
      }),
    );
  }
}
