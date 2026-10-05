import { createHmac } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type CreatedGitIntegration,
  type CreateGitIntegrationRequest,
  ERROR_CODES,
  extractItemKeys,
  type GitEvent,
  type GitIntegration,
  type GitIntegrationsResponse,
  MAX_GIT_INTEGRATIONS,
  parseGithubEvent,
  parseGitlabEvent,
  type UpdateGitIntegrationRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { generateToken, safeEqual } from '../../infra/security/tokens';
import { notFound } from '../spaces/space-errors';
import { asJson } from '../work-items/item-support';

const MAX_KEYS_PER_EVENT = 20;

const toIntegration = (row: {
  id: string;
  name: string;
  provider: GitIntegration['provider'];
  enabled: boolean;
  lastEventAt: Date | null;
  createdAt: Date;
}): GitIntegration => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  enabled: row.enabled,
  lastEventAt: row.lastEventAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** GitHub/GitLab bağlantısı (Faz 6.4, ADR-089): gelen webhook'u doğrular, commit/PR'ı iş anahtarına bağlar. */
@Injectable()
export class GitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get workspaceId() {
    return this.cls.get('workspaceId')!;
  }

  // ---------- Yönetim ----------

  async list(): Promise<GitIntegrationsResponse> {
    const rows = await this.prisma.gitIntegration.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return { integrations: rows.map(toIntegration), receiverPath: '/api/integrations/git' };
  }

  async create(input: CreateGitIntegrationRequest): Promise<CreatedGitIntegration> {
    const workspaceId = this.workspaceId;
    if (
      (await this.prisma.gitIntegration.count({ where: { workspaceId } })) >= MAX_GIT_INTEGRATIONS
    ) {
      throw new HttpException({ code: ERROR_CODES.GIT_INTEGRATION_LIMIT }, HttpStatus.CONFLICT);
    }
    const secret = `ghs_${generateToken()}`;
    const row = await this.prisma.gitIntegration.create({
      data: { workspaceId, name: input.name, provider: input.provider, secret },
    });
    return { integration: toIntegration(row), secret };
  }

  async update(id: string, input: UpdateGitIntegrationRequest): Promise<void> {
    const result = await this.prisma.gitIntegration.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { enabled: input.enabled },
    });
    if (result.count === 0) throw notFound();
  }

  async remove(id: string): Promise<void> {
    const result = await this.prisma.gitIntegration.deleteMany({
      where: { id, workspaceId: this.workspaceId },
    });
    if (result.count === 0) throw notFound();
  }

  // ---------- Gelen olay ----------

  /**
   * Sağlayıcıdan gelen webhook. İmza/token doğrulanmazsa 401 (kimlik doğrulama yok, oturum yok).
   * Geçersiz kimlik ile devre dışı entegrasyon aynı yanıtı verir (varlığı sızdırılmaz).
   */
  async receive(
    integrationId: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    body: unknown,
  ): Promise<{ linked: number }> {
    const header = (name: string) => {
      const v = headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    const integration = /^[0-9a-f-]{36}$/i.test(integrationId)
      ? await this.prisma.gitIntegration.findUnique({ where: { id: integrationId } })
      : null;
    if (!integration?.enabled)
      throw new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED });

    let events: GitEvent[];
    if (integration.provider === 'GITHUB') {
      const signature = header('x-hub-signature-256') ?? '';
      const expected = `sha256=${createHmac('sha256', integration.secret)
        .update(rawBody ?? Buffer.alloc(0))
        .digest('hex')}`;
      if (!rawBody || !safeEqual(signature, expected)) {
        throw new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED });
      }
      events = parseGithubEvent(header('x-github-event') ?? '', body);
    } else {
      if (!safeEqual(header('x-gitlab-token') ?? '', integration.secret)) {
        throw new UnauthorizedException({ code: ERROR_CODES.UNAUTHENTICATED });
      }
      events = parseGitlabEvent(header('x-gitlab-event') ?? '', body);
    }

    let linked = 0;
    for (const event of events) linked += await this.link(integration.workspaceId, event);
    await this.prisma.gitIntegration.update({
      where: { id: integration.id },
      data: { lastEventAt: new Date() },
    });
    return { linked };
  }

  /** Olayın metnindeki anahtarlara karşılık gelen işlere bağlantıyı ekler ya da (PR) günceller. */
  private async link(workspaceId: string, event: GitEvent): Promise<number> {
    const keys = extractItemKeys(event.text).slice(0, MAX_KEYS_PER_EVENT);
    if (keys.length === 0) return 0;
    const items = await this.prisma.workItem.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: keys.map((k) => ({ keyPrefix: k.prefix, number: k.number })),
      },
      select: { id: true },
    });

    let count = 0;
    for (const item of items) {
      const where = {
        workItemId_provider_kind_repo_externalId: {
          workItemId: item.id,
          provider: event.provider,
          kind: event.kind,
          repo: event.repo,
          externalId: event.externalId,
        },
      };
      const existing = await this.prisma.gitLink.findUnique({ where });
      const changed = !existing || existing.state !== event.state || existing.title !== event.title;
      await this.prisma.gitLink.upsert({
        where,
        create: {
          workspaceId,
          workItemId: item.id,
          provider: event.provider,
          kind: event.kind,
          repo: event.repo,
          externalId: event.externalId,
          title: event.title,
          url: event.url,
          state: event.state,
          author: event.author,
        },
        update: { title: event.title, url: event.url, state: event.state },
      });
      if (changed) {
        await this.prisma.activityEvent.create({
          data: {
            workspaceId,
            actorId: null,
            entityType: 'item',
            entityId: item.id,
            action: existing ? 'item.git_updated' : 'item.git_linked',
            changes: asJson({
              provider: event.provider,
              kind: event.kind,
              repo: event.repo,
              ref: event.kind === 'COMMIT' ? event.externalId.slice(0, 7) : `#${event.externalId}`,
              title: event.title,
              state: event.state,
            }),
          },
        });
      }
      count += 1;
    }
    return count;
  }
}
