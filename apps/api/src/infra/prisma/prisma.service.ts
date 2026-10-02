import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import type { Env } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  /** Bağlantı tembel kurulur; açılışta sadece erişilebilirlik loglanır (health ucu durumu raporlar). */
  async onModuleInit(): Promise<void> {
    if (await this.isReachable()) {
      this.logger.log('Veritabanı bağlantısı hazır');
    } else {
      this.logger.warn('Veritabanına ulaşılamıyor; /api/health "degraded" dönecek');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
