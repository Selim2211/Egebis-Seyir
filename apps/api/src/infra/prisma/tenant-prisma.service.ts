import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../cls/request-context';
import { PrismaService } from './prisma.service';
import { scopeArgs, TENANT_MODELS, TenantScopeError } from './tenant-scope';

function createTenantClient(prisma: PrismaService, cls: ClsService<AppClsStore>) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const workspaceId = cls.get('workspaceId');
          if (!workspaceId) {
            throw new TenantScopeError(`${model}.${operation}: istek bağlamında workspace yok`);
          }
          return query(scopeArgs(model, operation, args, workspaceId) as typeof args);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;

/**
 * Özellik modüllerinin kullandığı veritabanı istemcisi: workspace'e ait tüm sorgular
 * otomatik olarak istekteki workspace ile sınırlanır (ADR-012).
 * Ham PrismaService yalnızca kimlik doğrulama/erişim/kurulum altyapısında kullanılır.
 */
@Injectable()
export class TenantPrismaService {
  readonly db: TenantClient;

  constructor(prisma: PrismaService, cls: ClsService<AppClsStore>) {
    this.db = createTenantClient(prisma, cls);
  }
}
