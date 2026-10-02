import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@scrum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const dbUp = await this.prisma.isReachable();
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev',
      time: new Date().toISOString(),
    };
  }
}
