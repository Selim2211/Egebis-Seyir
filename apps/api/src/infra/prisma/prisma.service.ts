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
      // Havuz ve transaction süreleri ayarlanabilir (ADR-174). pg varsayılanı 10 bağlantı, Prisma'nın 2 sn bekleme
      // süresi yük altında "Unable to start a transaction in the given time" hatası veriyordu.
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: config.get('DB_POOL_MAX', { infer: true }),
        idleTimeoutMillis: 30_000,
      }),
      transactionOptions: {
        maxWait: config.get('DB_TX_MAX_WAIT_MS', { infer: true }),
        timeout: config.get('DB_TX_TIMEOUT_MS', { infer: true }),
      },
      log: config.get('DB_LOG_SLOW_MS', { infer: true })
        ? [{ emit: 'event', level: 'query' }]
        : undefined,
    });
    // Yavaş sorgu kaydı (ADR-174): yalnızca DB_LOG_SLOW_MS verilirse; teşhis içindir, normalde kapalı.
    const slowMs = config.get('DB_LOG_SLOW_MS', { infer: true });
    if (slowMs) {
      const events = this as unknown as {
        $on(
          event: 'query',
          cb: (e: { query: string; params: string; duration: number }) => void,
        ): void;
      };
      events.$on('query', (e) => {
        if (e.duration >= slowMs) {
          this.logger.warn(
            { ms: e.duration, query: e.query, params: e.params.slice(0, 500) },
            'yavaş sorgu',
          );
        }
      });
    }
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
