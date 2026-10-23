import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  ERROR_CODES,
  type Created,
  type SaveTicketCompanyRequest,
  type SaveTicketRuleRequest,
  type TicketCompaniesResponse,
  type TicketRulesResponse,
} from '@scrum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { fail } from '../work-items/item-support';

/** E-postanın gönderen domain'inden bulunan firma. `chain`: eşleşen firmadan en üst firmaya kimlikler. */
export interface ResolvedCompany {
  company: { id: string; name: string };
  root: { id: string; name: string };
  chain: string[];
  matchedDomain: string;
}

export interface Routing {
  /** Bug'ın gideceği Proje; null = Gelen kutusu (Belirsiz). */
  spaceId: string | null;
  spaceName: string | null;
  /** Atama günlüğüne yazılan gerekçe. */
  reason: string;
}

const notFound = () => new NotFoundException({ code: ERROR_CODES.NOT_FOUND });

/**
 * Firmalar, domain eşlemeleri ve yönlendirme kuralları (ADR-140). Alt firmanın domain'iyle gelen e-posta üst
 * firmaya bağlanır; Bug önce kurala (konu/metin anahtar kelimesi), sonra firmanın (ya da üst firmanın) varsayılan
 * Projesine gider, hiçbiri yoksa Gelen kutusunda (Belirsiz) kalır.
 */
@Injectable()
export class TicketCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Atama için geçerli Proje: silinmemiş, arşivde olmayan, gelen kutusu olmayan. */
  private async validSpace(workspaceId: string, spaceId: string | null) {
    if (!spaceId) return null;
    return this.prisma.space.findFirst({
      where: { id: spaceId, workspaceId, deletedAt: null, archivedAt: null, ticketInbox: false },
      select: { id: true, name: true },
    });
  }

  // ---------- Firmalar ----------

  async list(workspaceId: string): Promise<TicketCompaniesResponse> {
    const [rows, spaces] = await Promise.all([
      this.prisma.ticketCompany.findMany({
        where: { workspaceId },
        include: { domains: { select: { domain: true }, orderBy: { domain: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.space.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    const nameOf = new Map(rows.map((r) => [r.id, r.name]));
    const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
    return {
      companies: rows.map((r) => ({
        id: r.id,
        name: r.name,
        parentId: r.parentId,
        parentName: r.parentId ? (nameOf.get(r.parentId) ?? null) : null,
        defaultSpaceId: r.defaultSpaceId,
        defaultSpaceName: r.defaultSpaceId ? (spaceName.get(r.defaultSpaceId) ?? null) : null,
        notes: r.notes,
        domains: r.domains.map((d) => d.domain),
        childCount: rows.filter((c) => c.parentId === r.id).length,
      })),
    };
  }

  /** Doğrulamalar: ad tekil, üst firma döngü yapmaz, Proje geçerli, domain başka firmada değil. */
  private async validate(
    workspaceId: string,
    input: SaveTicketCompanyRequest,
    selfId: string | null,
  ) {
    const sameName = await this.prisma.ticketCompany.findFirst({
      where: {
        workspaceId,
        name: { equals: input.name, mode: 'insensitive' },
        ...(selfId ? { id: { not: selfId } } : {}),
      },
      select: { id: true },
    });
    if (sameName) throw fail(ERROR_CODES.TICKET_COMPANY_EXISTS, HttpStatus.CONFLICT);

    if (input.parentId) {
      const all = await this.prisma.ticketCompany.findMany({
        where: { workspaceId },
        select: { id: true, parentId: true },
      });
      const parents = new Map(all.map((c) => [c.id, c.parentId]));
      if (!parents.has(input.parentId)) throw notFound();
      // Üst firma zincirinde kendisi varsa döngü olur.
      for (let id: string | null = input.parentId, hops = 0; id && hops < 50; hops += 1) {
        if (id === selfId) throw fail(ERROR_CODES.TICKET_COMPANY_CYCLE, HttpStatus.CONFLICT);
        id = parents.get(id) ?? null;
      }
    }
    if (input.defaultSpaceId && !(await this.validSpace(workspaceId, input.defaultSpaceId))) {
      throw fail(ERROR_CODES.TICKET_SPACE_INVALID);
    }
    const domains = [...new Set(input.domains)];
    if (domains.length > 0) {
      const taken = await this.prisma.ticketCompanyDomain.findFirst({
        where: {
          workspaceId,
          domain: { in: domains },
          ...(selfId ? { companyId: { not: selfId } } : {}),
        },
        select: { domain: true },
      });
      if (taken)
        throw fail(ERROR_CODES.TICKET_DOMAIN_TAKEN, HttpStatus.CONFLICT, { domain: taken.domain });
    }
    return domains;
  }

  async create(workspaceId: string, input: SaveTicketCompanyRequest): Promise<Created> {
    const domains = await this.validate(workspaceId, input, null);
    const row = await this.prisma.ticketCompany.create({
      data: {
        workspaceId,
        name: input.name,
        parentId: input.parentId,
        defaultSpaceId: input.defaultSpaceId,
        notes: input.notes,
        domains: { create: domains.map((domain) => ({ workspaceId, domain })) },
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async update(workspaceId: string, id: string, input: SaveTicketCompanyRequest): Promise<void> {
    const existing = await this.prisma.ticketCompany.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw notFound();
    const domains = await this.validate(workspaceId, input, id);
    await this.prisma.$transaction([
      this.prisma.ticketCompanyDomain.deleteMany({
        where: { companyId: id, domain: { notIn: domains } },
      }),
      this.prisma.ticketCompany.update({
        where: { id },
        data: {
          name: input.name,
          parentId: input.parentId,
          defaultSpaceId: input.defaultSpaceId,
          notes: input.notes,
        },
      }),
      this.prisma.ticketCompanyDomain.createMany({
        data: domains.map((domain) => ({ workspaceId, companyId: id, domain })),
        skipDuplicates: true,
      }),
    ]);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const result = await this.prisma.ticketCompany.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw notFound();
  }

  // ---------- Kurallar ----------

  async rules(workspaceId: string): Promise<TicketRulesResponse> {
    const rows = await this.prisma.ticketRule.findMany({
      where: { workspaceId },
      include: { company: { select: { name: true } }, space: { select: { name: true } } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      rules: rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        companyName: r.company?.name ?? null,
        keyword: r.keyword,
        spaceId: r.spaceId,
        spaceName: r.space.name,
        position: r.position,
        enabled: r.enabled,
      })),
    };
  }

  private async checkRule(workspaceId: string, input: SaveTicketRuleRequest) {
    if (!(await this.validSpace(workspaceId, input.spaceId)))
      throw fail(ERROR_CODES.TICKET_SPACE_INVALID);
    if (input.companyId) {
      const company = await this.prisma.ticketCompany.findFirst({
        where: { id: input.companyId, workspaceId },
        select: { id: true },
      });
      if (!company) throw notFound();
    }
  }

  async createRule(workspaceId: string, input: SaveTicketRuleRequest): Promise<Created> {
    await this.checkRule(workspaceId, input);
    const last = await this.prisma.ticketRule.aggregate({
      where: { workspaceId },
      _max: { position: true },
    });
    const row = await this.prisma.ticketRule.create({
      data: { workspaceId, ...input, position: (last._max.position ?? 0) + 1 },
      select: { id: true },
    });
    return { id: row.id };
  }

  async updateRule(workspaceId: string, id: string, input: SaveTicketRuleRequest): Promise<void> {
    await this.checkRule(workspaceId, input);
    const result = await this.prisma.ticketRule.updateMany({
      where: { id, workspaceId },
      data: input,
    });
    if (result.count === 0) throw notFound();
  }

  async removeRule(workspaceId: string, id: string): Promise<void> {
    const result = await this.prisma.ticketRule.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw notFound();
  }

  /** Kuralı bir yukarı/aşağı taşır (komşusuyla sırasını değiştirir). */
  async moveRule(workspaceId: string, id: string, direction: 'up' | 'down'): Promise<void> {
    const rows = await this.prisma.ticketRule.findMany({
      where: { workspaceId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) throw notFound();
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= rows.length) return;
    const order = rows.map((r) => r.id);
    [order[index], order[swap]] = [order[swap]!, order[index]!];
    await this.prisma.$transaction(
      order.map((ruleId, position) =>
        this.prisma.ticketRule.update({ where: { id: ruleId }, data: { position } }),
      ),
    );
  }

  // ---------- Çözümleme ve yönlendirme ----------

  /** Gönderen adresin domain'ine en uzun eşleşen kayıtlı domain'in firması (alt alan adları dahil). */
  async resolve(workspaceId: string, email: string): Promise<ResolvedCompany | null> {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return null;
    const domains = await this.prisma.ticketCompanyDomain.findMany({
      where: { workspaceId },
      select: { domain: true, companyId: true },
    });
    const hit = domains
      .filter((d) => domain === d.domain || domain.endsWith(`.${d.domain}`))
      .sort((a, b) => b.domain.length - a.domain.length)[0];
    if (!hit) return null;
    const companies = await this.prisma.ticketCompany.findMany({
      where: { workspaceId },
      select: { id: true, name: true, parentId: true },
    });
    const byId = new Map(companies.map((c) => [c.id, c]));
    const chain: string[] = [];
    for (let id: string | null = hit.companyId; id && chain.length < 50 && !chain.includes(id);) {
      chain.push(id);
      id = byId.get(id)?.parentId ?? null;
    }
    const company = byId.get(hit.companyId);
    const root = byId.get(chain[chain.length - 1]!);
    if (!company || !root) return null;
    return {
      company: { id: company.id, name: company.name },
      root: { id: root.id, name: root.name },
      chain,
      matchedDomain: hit.domain,
    };
  }

  /** Bug'ın gideceği Projeyi seçer ve gerekçesini yazar (atama günlüğü). */
  async route(
    workspaceId: string,
    resolved: ResolvedCompany | null,
    subject: string,
    text: string,
  ): Promise<Routing> {
    const hay = `${subject}\n${text}`.toLocaleLowerCase('tr');
    const rules = await this.prisma.ticketRule.findMany({
      where: { workspaceId, enabled: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    for (const rule of rules) {
      if (rule.companyId && !resolved?.chain.includes(rule.companyId)) continue;
      if (!hay.includes(rule.keyword.toLocaleLowerCase('tr'))) continue;
      const space = await this.validSpace(workspaceId, rule.spaceId);
      if (!space) continue;
      return {
        spaceId: space.id,
        spaceName: space.name,
        reason: `Kural: “${rule.keyword}”${resolved ? ` · ${resolved.root.name}` : ''}`,
      };
    }
    if (resolved) {
      const companies = await this.prisma.ticketCompany.findMany({
        where: { workspaceId, id: { in: resolved.chain } },
        select: { id: true, name: true, defaultSpaceId: true },
      });
      for (const id of resolved.chain) {
        const company = companies.find((c) => c.id === id);
        const space = await this.validSpace(workspaceId, company?.defaultSpaceId ?? null);
        if (company && space) {
          return {
            spaceId: space.id,
            spaceName: space.name,
            reason: `Firma varsayılanı: ${company.name}`,
          };
        }
      }
      return {
        spaceId: null,
        spaceName: null,
        reason: `Firma bulundu (${resolved.root.name}) ama varsayılan proje tanımlı değil`,
      };
    }
    return { spaceId: null, spaceName: null, reason: 'Firma bulunamadı (domain tanımlı değil)' };
  }
}
