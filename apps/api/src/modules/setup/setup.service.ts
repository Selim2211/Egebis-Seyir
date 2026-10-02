import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES, type SetupRequest } from '@scrum/shared';
import type { Env } from '../../infra/config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { hashPassword } from '../../infra/security/password';
import { generateToken, safeEqual } from '../../infra/security/tokens';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';

/** Kurulumların aynı anda iki kez çalışmasını önleyen advisory lock anahtarı. */
const SETUP_LOCK = 724_001;

/**
 * İlk kurulum (ADR-034): hiç kullanıcı yokken ilk workspace ve Owner oluşturulur.
 * Kurulum anahtarı olmadan çalışmaz; anahtar SETUP_TOKEN'dan gelir ya da açılışta loglanır.
 */
@Injectable()
export class SetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetupService.name);
  /** SETUP_TOKEN ile verilen anahtar kalıcıdır; verilmemişse tek seferlik anahtar üretilir. */
  private readonly configuredToken?: string;
  private generatedToken?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    config: ConfigService<Env, true>,
  ) {
    this.configuredToken = config.get('SETUP_TOKEN', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      if (await this.needsSetup()) this.announceToken();
    } catch {
      // Veritabanı henüz hazır değilse açılış engellenmez; durum ucu tekrar dener.
    }
  }

  async needsSetup(): Promise<boolean> {
    return (await this.prisma.user.count()) === 0;
  }

  /** Kurulumu yapar ve Owner'ın kullanıcı id'sini döndürür. */
  async run(input: SetupRequest): Promise<string> {
    const expected = this.announceToken();
    if (!safeEqual(input.setupToken, expected)) {
      throw new ForbiddenException({ code: ERROR_CODES.SETUP_TOKEN_INVALID });
    }
    const passwordHash = await hashPassword(input.password);

    const userId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK})`;
      if ((await tx.user.count()) > 0)
        throw new ConflictException({ code: ERROR_CODES.SETUP_ALREADY_DONE });

      const workspace = await tx.workspace.create({ data: { name: input.workspaceName } });
      const roles = await this.access.createSystemRoles(tx, workspace.id);
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash, locale: input.locale },
      });
      await tx.membership.create({
        data: { workspaceId: workspace.id, userId: user.id, roleId: roles.OWNER },
      });
      await this.activity.record(tx, {
        workspaceId: workspace.id,
        actorId: user.id,
        entityType: 'workspace',
        entityId: workspace.id,
        action: 'workspace.created',
        changes: { name: workspace.name },
      });
      return user.id;
    });

    this.generatedToken = undefined;
    this.logger.log('İlk kurulum tamamlandı; kurulum ekranı kapandı');
    return userId;
  }

  private announceToken(): string {
    if (this.configuredToken) return this.configuredToken;
    if (!this.generatedToken) {
      this.generatedToken = generateToken();
      this.logger.warn(`İlk kurulum gerekiyor. Kurulum anahtarı: ${this.generatedToken}`);
    }
    return this.generatedToken;
  }
}
