import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { Env } from '../config/env';

type Handler<T> = (data: T) => Promise<void>;

/**
 * Arka plan işleri (ADR-017, pg-boss). QUEUE_ENABLED=false iken işler çağrıldığı anda
 * çalıştırılır; testler bu modla deterministik kalır.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly enabled: boolean;
  /** Arka plan işçisi mi (ADR-174)? Değilse işleri yalnızca kuyruğa atar; işlemez ve zamanlamaz. */
  private readonly worker: boolean;
  private readonly connectionString: string;
  private readonly handlers = new Map<string, Handler<unknown>>();
  private boss?: PgBoss;
  private starting?: Promise<PgBoss>;

  constructor(config: ConfigService<Env, true>) {
    this.enabled = config.get('QUEUE_ENABLED', { infer: true });
    this.worker = config.get('BACKGROUND_WORKER', { infer: true });
    this.connectionString = config.get('DATABASE_URL', { infer: true });
  }

  /** Bir iş tipini ve işleyicisini kaydeder (modül açılışında çağrılır). */
  async register<T extends object>(name: string, handler: Handler<T>): Promise<void> {
    this.handlers.set(name, handler as Handler<unknown>);
    if (!this.enabled) return;
    const boss = await this.start();
    await boss.createQueue(name, { retryLimit: 5, retryBackoff: true });
    if (!this.worker) return;
    await boss.work<T>(name, async ([job]) => {
      if (job) await handler(job.data);
    });
  }

  /**
   * Zamanlanmış iş (cron, Europe/Istanbul). QUEUE_ENABLED=false iken zamanlanmaz;
   * testler işleyiciyi doğrudan çağırır.
   */
  async schedule(name: string, cron: string, handler: () => Promise<void>): Promise<void> {
    await this.register(name, handler);
    if (!this.enabled || !this.worker) return;
    const boss = await this.start();
    await boss.schedule(name, cron, {}, { tz: 'Europe/Istanbul' });
  }

  async enqueue<T extends object>(name: string, data: T): Promise<void> {
    if (!this.enabled) {
      const handler = this.handlers.get(name);
      if (!handler) throw new Error(`Kayıtlı iş tipi yok: ${name}`);
      await handler(data);
      return;
    }
    const boss = await this.start();
    await boss.send(name, data);
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5_000 });
  }

  private start(): Promise<PgBoss> {
    this.starting ??= (async () => {
      // pg-boss kendi havuzunu açar (varsayılan 10); API havuzuyla birlikte PG bağlantı sınırını aşmasın.
      const boss = new PgBoss({
        connectionString: this.connectionString,
        max: this.worker ? 4 : 2,
      });
      boss.on('error', (err) => this.logger.error(err));
      await boss.start();
      this.boss = boss;
      this.logger.log('İş kuyruğu (pg-boss) başladı');
      return boss;
    })();
    return this.starting;
  }
}
