import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type PutQuotaRequest,
  type QuotasResponse,
  type QuotaUsage,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { fail } from '../work-items/item-support';

const MB = 1024 * 1024;

/**
 * Doküman/video yükleme sınırları (ADR-154). Kişinin kendi sınırı ve üyesi olduğu her ekibin sınırı
 * ayrı ayrı denetlenir; ekip kullanımı ekip üyelerinin yüklemelerinin toplamıdır.
 */
@Injectable()
export class QuotasService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  /** Kullanıcıların yüklediği ek ve videoların sayısı ve toplam boyutu. */
  private async usage(userIds: string[]): Promise<QuotaUsage> {
    if (userIds.length === 0) return { files: 0, bytes: 0 };
    const db = this.tenant.db;
    const [attachments, videos] = await Promise.all([
      db.attachment.aggregate({
        where: { uploaderId: { in: userIds } },
        _count: { _all: true },
        _sum: { size: true },
      }),
      db.video.aggregate({
        where: { uploadedById: { in: userIds } },
        _count: { _all: true },
        _sum: { size: true },
      }),
    ]);
    return {
      files: attachments._count._all + videos._count._all,
      bytes: (attachments._sum.size ?? 0) + Number(videos._sum.size ?? 0n),
    };
  }

  /** Yükleme öncesi denetim: sınır aşılıyorsa UPLOAD_QUOTA_EXCEEDED (413). */
  async assertCanUpload(userId: string, bytes: number): Promise<void> {
    const db = this.tenant.db;
    const teams = await db.teamMember.findMany({ where: { userId }, select: { teamId: true } });
    const quotas = await db.uploadQuota.findMany({
      where: { OR: [{ userId }, { teamId: { in: teams.map((t) => t.teamId) } }] },
      include: { team: { select: { name: true, members: { select: { userId: true } } } } },
    });
    for (const quota of quotas) {
      if (quota.maxFiles === null && quota.maxMb === null) continue;
      const used = await this.usage(
        quota.team ? quota.team.members.map((m) => m.userId) : [userId],
      );
      const filesOver = quota.maxFiles !== null && used.files + 1 > quota.maxFiles;
      const bytesOver = quota.maxMb !== null && used.bytes + bytes > quota.maxMb * MB;
      if (filesOver || bytesOver) {
        throw fail(ERROR_CODES.UPLOAD_QUOTA_EXCEEDED, HttpStatus.PAYLOAD_TOO_LARGE, {
          scope: quota.team ? 'TEAM' : 'USER',
          team: quota.team?.name ?? null,
          maxFiles: quota.maxFiles,
          maxMb: quota.maxMb,
          usedFiles: used.files,
          usedMb: Math.round(used.bytes / MB),
        });
      }
    }
  }

  async list(): Promise<QuotasResponse> {
    const rows = await this.tenant.db.uploadQuota.findMany({
      include: {
        user: { select: { name: true } },
        team: { select: { name: true, members: { select: { userId: true } } } },
      },
    });
    const quotas = await Promise.all(
      rows.map(async (q) => ({
        id: q.id,
        target: q.teamId ? ('TEAM' as const) : ('USER' as const),
        targetId: (q.teamId ?? q.userId)!,
        name: q.team?.name ?? q.user?.name ?? '',
        maxFiles: q.maxFiles,
        maxMb: q.maxMb,
        usage: await this.usage(q.team ? q.team.members.map((m) => m.userId) : [q.userId!]),
      })),
    );
    quotas.sort((a, b) => a.target.localeCompare(b.target) || a.name.localeCompare(b.name, 'tr'));
    return { quotas };
  }

  /** Sınırı yazar; iki sınır da boşsa kaydı siler. */
  async put(input: PutQuotaRequest): Promise<void> {
    const workspaceId = this.cls.get('workspaceId')!;
    const actorId = this.cls.get('userId')!;
    const db = this.tenant.db;
    const found = input.userId
      ? await db.membership.findFirst({ where: { userId: input.userId } })
      : await db.team.findFirst({ where: { id: input.teamId } });
    if (!found) throw fail(ERROR_CODES.NOT_FOUND, HttpStatus.NOT_FOUND);
    const where = input.userId ? { userId: input.userId } : { teamId: input.teamId! };
    await db.$transaction(async (tx) => {
      const existing = await tx.uploadQuota.findFirst({ where });
      if (input.maxFiles === null && input.maxMb === null) {
        if (existing) await tx.uploadQuota.delete({ where: { id: existing.id } });
      } else if (existing) {
        await tx.uploadQuota.update({
          where: { id: existing.id },
          data: { maxFiles: input.maxFiles, maxMb: input.maxMb },
        });
      } else {
        await tx.uploadQuota.create({
          data: { workspaceId, ...where, maxFiles: input.maxFiles, maxMb: input.maxMb },
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'workspace',
        entityId: workspaceId,
        action: 'quota.updated',
        changes: { ...where, maxFiles: input.maxFiles, maxMb: input.maxMb },
      });
    });
  }
}
