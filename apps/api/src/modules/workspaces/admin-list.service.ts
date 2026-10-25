import { Injectable } from '@nestjs/common';
import {
  ADMIN_LIST_PAGE_SIZE,
  BUG_SEVERITIES,
  formatItemKey,
  type AdminListQuery,
  type AdminListResponse,
  type BugSeverity,
} from '@scrum/shared';
import type { Prisma } from '../../generated/prisma/client';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';

const DAY_MS = 86_400_000;
const TZ = 'Europe/Istanbul';
const dayKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
/** Türkiye'de yaz/kış saati yok: gün başlangıcı her zaman +03:00. */
const dayStart = (key: string) => new Date(`${key}T00:00:00+03:00`);

const OPEN: Prisma.WorkItemWhereInput = { status: { category: { not: 'DONE' } } };
const DONE: Prisma.WorkItemWhereInput = { status: { category: 'DONE' } };
const NEW_MAIL = (extra: Prisma.InboundEmailWhereInput = {}): Prisma.WorkItemWhereInput => ({
  inboundEmails: { some: { kind: 'NEW', ...extra } },
});

/**
 * Yönetici panelindeki kutucuk ve grafiklerin listesi (ADR-142). Her `kind`, panelde gösterilen sayının
 * aynısını veren süzgeçtir; böylece tıklayınca sayı ile listedeki kayıt sayısı tutar.
 */
@Injectable()
export class AdminListService {
  constructor(private readonly tenant: TenantPrismaService) {}

  /** Süzgeci Prisma koşuluna çevirir. Geçersiz `value` boş sonuç verir (hata atmaz). */
  private where(query: AdminListQuery, now: Date): Prisma.WorkItemWhereInput {
    const today = dayKey(now);
    const todayStart = dayStart(today);
    const weekStart = dayStart(dayKey(new Date(now.getTime() - 6 * DAY_MS)));
    const bug: Prisma.WorkItemWhereInput = { type: 'BUG' };
    const value = query.value ?? '';
    const none: Prisma.WorkItemWhereInput = { id: { in: [] } };
    switch (query.kind) {
      case 'open-work':
        return OPEN;
      case 'overdue':
        return { AND: [OPEN, { dueDate: { lt: new Date(`${today}T00:00:00Z`) } }] };
      case 'completed-week':
        return { AND: [DONE, { completedAt: { gte: weekStart } }] };
      case 'unassigned-work':
        return { AND: [OPEN, { assignees: { none: {} } }] };
      case 'bugs-all':
        return bug;
      case 'bugs-open':
        return { AND: [bug, OPEN] };
      case 'bugs-new-today':
        return { AND: [bug, { createdAt: { gte: todayStart } }] };
      case 'bugs-new-week':
        return { AND: [bug, { createdAt: { gte: weekStart } }] };
      case 'bugs-resolved-today':
        return { AND: [bug, DONE, { completedAt: { gte: todayStart } }] };
      case 'bugs-resolved-week':
        return { AND: [bug, DONE, { completedAt: { gte: weekStart } }] };
      case 'bugs-unassigned':
        return { AND: [bug, OPEN, { assignees: { none: {} } }] };
      case 'bugs-inbox':
        return { AND: [bug, OPEN, { space: { ticketInbox: true } }] };
      case 'bugs-awaiting':
        return {
          AND: [bug, OPEN, NEW_MAIL(), { NOT: { inboundEmails: { some: { kind: 'OUTBOUND' } } } }],
        };
      case 'bugs-email':
        return { AND: [bug, NEW_MAIL()] };
      case 'bugs-manual':
        return { AND: [bug, { NOT: NEW_MAIL() }] };
      case 'bugs-severity':
        return (BUG_SEVERITIES as readonly string[]).includes(value)
          ? { AND: [bug, OPEN, { severity: value as BugSeverity }] }
          : none;
      case 'bugs-company':
        if (value === 'none') return { AND: [bug, NEW_MAIL({ rootCompanyId: null })] };
        return /^[0-9a-f-]{36}$/i.test(value)
          ? { AND: [bug, NEW_MAIL({ rootCompanyId: value })] }
          : none;
      case 'bugs-age': {
        const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
        const range: Record<string, Prisma.WorkItemWhereInput> = {
          D1: { createdAt: { gt: ago(1) } },
          D3: { createdAt: { gt: ago(3), lte: ago(1) } },
          D7: { createdAt: { gt: ago(7), lte: ago(3) } },
          D7P: { createdAt: { lte: ago(7) } },
        };
        return range[value] ? { AND: [bug, OPEN, range[value]] } : none;
      }
      case 'bugs-route': {
        const by: Record<string, Prisma.InboundEmailWhereInput> = {
          rule: { routeReason: { startsWith: 'Kural:' } },
          company: { routeReason: { startsWith: 'Firma varsayılanı' } },
          ai: { routeReason: { startsWith: 'YZ:' } },
          none: {
            OR: [
              { routeReason: null },
              {
                NOT: {
                  OR: [
                    { routeReason: { startsWith: 'Kural:' } },
                    { routeReason: { startsWith: 'Firma varsayılanı' } },
                    { routeReason: { startsWith: 'YZ:' } },
                  ],
                },
              },
            ],
          },
        };
        return by[value] ? { AND: [bug, NEW_MAIL(by[value])] } : none;
      }
      case 'person':
        return /^[0-9a-f-]{36}$/i.test(value)
          ? { AND: [OPEN, { assignees: { some: { userId: value } } }] }
          : none;
      case 'project':
        return /^[0-9a-f-]{36}$/i.test(value) ? { AND: [OPEN, { spaceId: value }] } : none;
    }
  }

  private async label(query: AdminListQuery): Promise<string | null> {
    const db = this.tenant.db;
    const value = query.value ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(value)) return null;
    if (query.kind === 'person')
      return (
        (await db.user.findUnique({ where: { id: value }, select: { name: true } }))?.name ?? null
      );
    if (query.kind === 'project')
      return (
        (await db.space.findUnique({ where: { id: value }, select: { name: true } }))?.name ?? null
      );
    if (query.kind === 'bugs-company')
      return (
        (await db.ticketCompany.findUnique({ where: { id: value }, select: { name: true } }))
          ?.name ?? null
      );
    return null;
  }

  async list(query: AdminListQuery, now = new Date()): Promise<AdminListResponse> {
    const db = this.tenant.db;
    const where: Prisma.WorkItemWhereInput = {
      AND: [
        {
          type: { in: ['TASK', 'BUG'] },
          deletedAt: null,
          archivedAt: null,
          space: { deletedAt: null, archivedAt: null },
        },
        this.where(query, now),
      ],
    };
    const total = await db.workItem.count({ where });
    const pages = Math.max(1, Math.ceil(total / ADMIN_LIST_PAGE_SIZE));
    const page = Math.min(query.page, pages);
    const rows = await db.workItem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * ADMIN_LIST_PAGE_SIZE,
      take: ADMIN_LIST_PAGE_SIZE,
      select: {
        id: true,
        type: true,
        title: true,
        keyPrefix: true,
        number: true,
        severity: true,
        dueDate: true,
        createdAt: true,
        space: { select: { id: true, name: true, color: true, ticketInbox: true } },
        status: { select: { name: true, category: true } },
        assignees: { select: { user: { select: { id: true, name: true } } } },
        inboundEmails: {
          where: { kind: 'NEW' },
          take: 1,
          select: {
            company: { select: { name: true } },
            rootCompany: { select: { name: true } },
          },
        },
      },
    });
    return {
      items: rows.map((r) => {
        const mail = r.inboundEmails[0];
        return {
          id: r.id,
          key: formatItemKey(r.keyPrefix, r.number),
          title: r.title,
          type: r.type as 'TASK' | 'BUG',
          space: {
            id: r.space.id,
            name: r.space.name,
            color: r.space.color,
            inbox: r.space.ticketInbox,
          },
          status: r.status,
          severity: r.severity,
          dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
          createdAt: r.createdAt.toISOString(),
          assignees: r.assignees.map((a) => a.user),
          company: mail?.rootCompany?.name ?? mail?.company?.name ?? null,
        };
      }),
      total,
      page,
      pageSize: ADMIN_LIST_PAGE_SIZE,
      pages,
      valueLabel: await this.label(query),
    };
  }
}
