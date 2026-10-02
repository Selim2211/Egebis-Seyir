import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { HealthService } from './health.service';

const prismaStub = (reachable: boolean) =>
  ({ isReachable: () => Promise.resolve(reachable) }) as unknown as PrismaService;

describe('HealthService', () => {
  it('veritabanı erişilebilirse ok döner', async () => {
    const result = await new HealthService(prismaStub(true)).check();
    expect(result).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('veritabanı erişilemezse degraded döner', async () => {
    const result = await new HealthService(prismaStub(false)).check();
    expect(result).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
