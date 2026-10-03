import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, type SetupRequest } from '@scrum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { hashPassword } from '../../infra/security/password';
import { AccessService } from '../access/access.service';
import { ActivityService } from '../activity/activity.service';

/** Kurulumların aynı anda iki kez çalışmasını önleyen advisory lock anahtarı. */
const SETUP_LOCK = 724_001;

/**
 * İlk kurulum (ADR-034): hiç kullanıcı yokken ilk workspace ve Owner oluşturulur.
 * Kurulum anahtarı yoktur (ADR-073): ekran yalnızca hiç kullanıcı yokken açıktır ve ilk kullanıcıyla kapanır.
 */
@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
  ) {}

  async needsSetup(): Promise<boolean> {
    return (await this.prisma.user.count()) === 0;
  }

  /** Kurulumu yapar ve Owner'ın kullanıcı id'sini döndürür. */
  async run(input: SetupRequest): Promise<string> {
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

    this.logger.log('İlk kurulum tamamlandı; kurulum ekranı kapandı');
    return userId;
  }
}
