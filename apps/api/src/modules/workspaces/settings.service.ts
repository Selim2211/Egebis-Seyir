import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WORKSPACE_PERMISSIONS as W,
  type Locale,
  type MailTestResult,
  type UpdateWorkspaceSettingsRequest,
  type WorkspaceSettings,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { RoleScope } from '../../generated/prisma/client';
import type { Env } from '../../infra/config/env';
import type { AppClsStore } from '../../infra/cls/request-context';
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
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Yöneticinin kendi adresine doğrudan test e-postası yollar; hata nedenini döner (ADR-119). */
  async sendTestMail(user: AuthUser): Promise<MailTestResult> {
    const outcome = await this.mail.sendTest(
      testMail({
        to: user.email,
        locale: user.locale as Locale,
        url: this.config.get('APP_URL', { infer: true }),
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
