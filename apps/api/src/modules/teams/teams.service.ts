import { ConflictException, ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  MAX_TEAMS_PER_WORKSPACE,
  type CreateTeamRequest,
  type Created,
  type TeamsResponse,
  type UpdateTeamRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { fail } from '../work-items/item-support';

/**
 * Ekipler (Faz 7.7, ADR-101): kullanıcıları adlandırılmış gruplar hâlinde tutar. Free ClickUp yalınlığında,
 * Guest dışındaki her üye ekip oluşturur ve düzenler.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private assertMember(): void {
    if (this.cls.get('workspaceRole') === 'GUEST') {
      throw new ForbiddenException({ code: ERROR_CODES.FORBIDDEN });
    }
  }

  /** Üyeler workspace'in Guest olmayan üyeleri olmalıdır; aksi hâlde bulunamadı. */
  private async assertMembers(userIds: string[]): Promise<string[]> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return unique;
    const found = await this.tenant.db.membership.count({
      where: { userId: { in: unique }, role: { key: { not: 'GUEST' } } },
    });
    if (found !== unique.length) throw notFound();
    return unique;
  }

  async list(): Promise<TeamsResponse> {
    this.assertMember();
    const rows = await this.tenant.db.team.findMany({
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatarVersion: true } } },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return {
      teams: rows.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        members: t.members.map((m) => m.user).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      })),
    };
  }

  async create(input: CreateTeamRequest): Promise<Created> {
    this.assertMember();
    const db = this.tenant.db;
    const workspaceId = this.cls.get('workspaceId')!;
    const memberIds = await this.assertMembers(input.memberIds ?? []);
    if ((await db.team.count()) >= MAX_TEAMS_PER_WORKSPACE) {
      throw fail(ERROR_CODES.TEAM_LIMIT, HttpStatus.CONFLICT);
    }
    try {
      const row = await db.team.create({
        data: {
          workspaceId,
          name: input.name.trim(),
          color: input.color ?? '#2563EB',
          members: { create: memberIds.map((userId) => ({ workspaceId, userId })) },
        },
        select: { id: true },
      });
      return { id: row.id };
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(teamId: string, input: UpdateTeamRequest): Promise<void> {
    this.assertMember();
    const db = this.tenant.db;
    const workspaceId = this.cls.get('workspaceId')!;
    if (!(await db.team.findFirst({ where: { id: teamId }, select: { id: true } }))) {
      throw notFound();
    }
    const memberIds =
      input.memberIds !== undefined ? await this.assertMembers(input.memberIds) : undefined;
    try {
      await db.$transaction(async (tx) => {
        if (input.name !== undefined || input.color !== undefined) {
          await tx.team.update({
            where: { id: teamId },
            data: {
              ...(input.name !== undefined && { name: input.name.trim() }),
              ...(input.color !== undefined && { color: input.color }),
            },
          });
        }
        if (memberIds) {
          await tx.teamMember.deleteMany({ where: { teamId } });
          await tx.teamMember.createMany({
            data: memberIds.map((userId) => ({ teamId, userId, workspaceId })),
          });
        }
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async remove(teamId: string): Promise<void> {
    this.assertMember();
    const result = await this.tenant.db.team.deleteMany({ where: { id: teamId } });
    if (result.count === 0) throw notFound();
  }

  private mapConflict(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException({ code: ERROR_CODES.TEAM_NAME_TAKEN });
    }
    return error;
  }
}
