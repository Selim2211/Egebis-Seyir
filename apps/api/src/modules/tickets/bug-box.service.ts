import { Injectable } from '@nestjs/common';
import {
  BUG_BOX_PAGE_SIZE,
  SPACE_PERMISSIONS as S,
  formatItemKey,
  type BugBoxQuery,
  type BugBoxResponse,
} from '@scrum/shared';
import type { Prisma } from '../../generated/prisma/client';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';

/**
 * Bug Kutusu (ADR-140): tüm Projelerdeki Bug'lar tek listede. Kullanıcı yalnızca görebildiği Projelerin Bug'larını
 * görür (Owner/Admin hepsini). Sayfa başına 20 kayıt; tarihe göre sıralanır; firma, başlık/anahtar, gönderen, sahip,
 * atanan ve Proje adına göre aranır.
 */
@Injectable()
export class BugBoxService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly access: SpaceAccessService,
  ) {}

  async list(query: BugBoxQuery): Promise<BugBoxResponse> {
    const db = this.tenant.db;
    const perms = await this.access.permissionMap({ deletedAt: null });
    const spaceIds = [...perms.entries()]
      .filter(([, p]) => p.includes(S.SPACE_VIEW))
      .map(([id]) => id);

    const text = (value: string) => ({ contains: value, mode: 'insensitive' as const });
    const key = /^([a-z0-9]+)-(\d+)$/i.exec(query.q);
    const search: Prisma.WorkItemWhereInput[] = query.q
      ? [
          { title: text(query.q) },
          ...(key
            ? [
                {
                  keyPrefix: { equals: key[1]!, mode: 'insensitive' as const },
                  number: Number(key[2]),
                },
              ]
            : []),
          { space: { name: text(query.q) } },
          { reporter: { name: text(query.q) } },
          { assignees: { some: { user: { name: text(query.q) } } } },
          {
            inboundEmails: {
              some: {
                kind: 'NEW',
                OR: [
                  { fromName: text(query.q) },
                  { fromEmail: text(query.q) },
                  { company: { name: text(query.q) } },
                  { rootCompany: { name: text(query.q) } },
                ],
              },
            },
          },
        ]
      : [];
    const where: Prisma.WorkItemWhereInput = {
      type: 'BUG',
      deletedAt: null,
      archivedAt: null,
      spaceId: { in: spaceIds },
      space: { archivedAt: null },
      ...(search.length > 0 ? { OR: search } : {}),
    };

    const total = await db.workItem.count({ where });
    const pages = Math.max(1, Math.ceil(total / BUG_BOX_PAGE_SIZE));
    const page = Math.min(query.page, pages);
    const dir = query.sort === 'old' ? 'asc' : 'desc';
    const person = { select: { id: true, name: true } } as const;
    const rows = await db.workItem.findMany({
      where,
      orderBy: [{ createdAt: dir }, { id: dir }],
      skip: (page - 1) * BUG_BOX_PAGE_SIZE,
      take: BUG_BOX_PAGE_SIZE,
      include: {
        space: { select: { id: true, key: true, name: true, color: true, ticketInbox: true } },
        reporter: person,
        assignees: { select: { user: person }, take: 1 },
        inboundEmails: {
          where: { kind: 'NEW' },
          take: 1,
          select: {
            fromName: true,
            fromEmail: true,
            routedSpaceName: true,
            routeReason: true,
            company: { select: { name: true } },
            rootCompany: { select: { name: true } },
          },
        },
        convertedTasks: {
          where: { deletedAt: null },
          select: { keyPrefix: true, number: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      items: rows.map((r) => {
        const mail = r.inboundEmails[0];
        const assignee = r.assignees[0]?.user ?? null;
        const root = mail?.rootCompany?.name ?? null;
        const own = mail?.company?.name ?? null;
        return {
          id: r.id,
          key: formatItemKey(r.keyPrefix, r.number),
          title: r.title,
          space: {
            id: r.space.id,
            key: r.space.key,
            name: r.space.name,
            color: r.space.color,
            inbox: r.space.ticketInbox,
          },
          bugStatus: r.bugStatus ?? (assignee ? 'ASSIGNED' : 'UNASSIGNED'),
          severity: r.severity,
          owner: r.reporter,
          assignee,
          email: mail
            ? {
                fromName: mail.fromName,
                fromEmail: mail.fromEmail,
                company: root ?? own,
                subCompany: root && own && own !== root ? own : null,
                routedTo: mail.routedSpaceName,
                routeReason: mail.routeReason,
              }
            : null,
          convertedTo: r.convertedTasks.map((t) => formatItemKey(t.keyPrefix, t.number)),
          createdAt: r.createdAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize: BUG_BOX_PAGE_SIZE,
      pages,
    };
  }
}
