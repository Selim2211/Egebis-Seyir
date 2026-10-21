import { Injectable } from '@nestjs/common';
import {
  WORKSPACE_PERMISSIONS as W,
  type AppUrlSettings,
  type Locale,
  type MailSettings,
  type MailTestResult,
  type UpdateAppUrlRequest,
  type UpdateMailSettingsRequest,
  type UpdateWorkspaceSettingsRequest,
  type WorkspaceSettings,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { AppSettingsService } from '../../infra/settings/app-settings.service';
import { MailSettingsService } from '../../infra/mail/mail-settings.service';
import { MailService } from '../../infra/mail/mail.service';
import { testMail } from '../../infra/mail/templates';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '../auth/auth.constants';

/** Workspace genel ayarları (brief §5.20). */
@Injectable()
export class WorkspaceSettingsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly mailSettings: MailSettingsService,
    private readonly appSettings: AppSettingsService,
  ) {}

  getAppUrl(): Promise<AppUrlSettings> {
    return this.appSettings.view();
  }

  /** Genel adres: e-postalardaki bağlantıların kökü. `null` kaydı siler, .env değerine dönülür (ADR-122). */
  async updateAppUrl(input: UpdateAppUrlRequest): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const before = await this.appSettings.view();
    await this.appSettings.save(input.url);
    const after = await this.appSettings.view();
    if (before.url === after.url) return;
    await this.activity.record(this.tenant.db, {
      workspaceId,
      actorId: this.cls.get('userId')!,
      entityType: 'workspace',
      entityId: workspaceId,
      action: 'workspace.app_url_updated',
      changes: { url: { from: before.url, to: after.url } },
    });
  }

  getMail(): Promise<MailSettings> {
    return this.mailSettings.view();
  }

  /** SMTP ayarını kaydeder (şifre şifreli). Etkinlik kaydına şifre değil yalnızca değişen alanlar yazılır (ADR-120). */
  async updateMail(input: UpdateMailSettingsRequest): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    const before = await this.mailSettings.view();
    await this.mailSettings.save(input, actorId);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const after = { host: input.host, port: input.port, secure: input.secure, from: input.from };
    for (const [key, to] of Object.entries(after)) {
      const from = before[key as keyof typeof after];
      if (from !== to) changes[key] = { from, to };
    }
    if (input.password !== undefined)
      changes.password = { from: null, to: input.password ? 'set' : 'cleared' };
    await this.activity.record(this.tenant.db, {
      workspaceId,
      actorId,
      entityType: 'workspace',
      entityId: workspaceId,
      action: 'workspace.mail_updated',
      changes: changes as Record<string, { from: string; to: string }>,
    });
  }

  /** Uygulamada kaydedilmiş SMTP ayarını siler; sunucu .env değerlerine dönülür. */
  async resetMail(): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    await this.mailSettings.reset();
    await this.activity.record(this.tenant.db, {
      workspaceId,
      actorId: this.cls.get('userId')!,
      entityType: 'workspace',
      entityId: workspaceId,
      action: 'workspace.mail_reset',
    });
  }

  /** Yöneticinin kendi adresine doğrudan test e-postası yollar; hata nedenini döner (ADR-119). */
  async sendTestMail(user: AuthUser): Promise<MailTestResult> {
    const outcome = await this.mail.sendTest(
      testMail({
        to: user.email,
        locale: user.locale as Locale,
        url: await this.appSettings.publicUrl(),
      }),
    );
    return { ...outcome, to: user.email };
  }

  async get(): Promise<WorkspaceSettings> {
    const [workspace, member] = await Promise.all([
      this.tenant.db.workspace.findUniqueOrThrow({
        where: { id: this.cls.get('workspaceId')! },
        select: { name: true },
      }),
      this.memberRole(),
    ]);
    return {
      name: workspace.name,
      membersCanCreateSpaces: member.permissions.includes(W.SPACE_CREATE),
    };
  }

  /**
   * "Member'lar Space oluşturabilir" ayarı MEMBER rolünün izin setinde saklanır (ADR-042).
   */
  async update(input: UpdateWorkspaceSettingsRequest): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const current = await this.get();
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (input.name !== undefined && input.name !== current.name) {
      changes.name = { from: current.name, to: input.name };
    }
    if (
      input.membersCanCreateSpaces !== undefined &&
      input.membersCanCreateSpaces !== current.membersCanCreateSpaces
    ) {
      changes.membersCanCreateSpaces = {
        from: current.membersCanCreateSpaces,
        to: input.membersCanCreateSpaces,
      };
    }
    if (Object.keys(changes).length === 0) return;

    const member = await this.memberRole();
    await this.tenant.db.$transaction(async (tx) => {
      if (changes.name) {
        await tx.workspace.update({ where: { id: workspaceId }, data: { name: input.name } });
      }
      if (changes.membersCanCreateSpaces) {
        const others = member.permissions.filter((p) => p !== W.SPACE_CREATE);
        await tx.role.update({
          where: { id: member.id },
          data: {
            permissions: input.membersCanCreateSpaces ? [...others, W.SPACE_CREATE] : others,
          },
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId: this.cls.get('userId')!,
        entityType: 'workspace',
        entityId: workspaceId,
        action: 'workspace.updated',
        changes: changes as Record<string, { from: string; to: string }>,
      });
    });
  }

  private memberRole() {
    return this.tenant.db.role.findFirstOrThrow({
      where: { scope: RoleScope.WORKSPACE, key: 'MEMBER' },
      select: { id: true, permissions: true },
    });
  }
}
