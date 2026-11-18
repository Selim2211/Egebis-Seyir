import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, tap } from 'rxjs';

const SHORT_CACHE_TTL = 'short-cache-ttl';
const MAX_ENTRIES = 300;

/**
 * Ağır panoların (analiz, yönetici paneli, akış raporu) yanıtını kısa süre (varsayılan 30 sn) bellekte tutar.
 * Anahtar: kullanıcı + tam adres (sorgu dahil) — izin kapsamı kişiye göre değiştiği için kişiler arasında
 * paylaşılmaz. Yük testi: bu uçlar 50 bin satırı okuyup CPU'yu uzun süre meşgul ediyordu; aynı panoyu
 * art arda açan kullanıcılar artık veritabanına ve CPU'ya yeniden yük bindirmez. Bedeli: en çok TTL kadar eski veri.
 */
@Injectable()
export class ShortCacheInterceptor implements NestInterceptor {
  private readonly store = new Map<string, { expires: number; value: unknown }>();

  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ttl = this.reflector.get<number | undefined>(SHORT_CACHE_TTL, ctx.getHandler());
    const req = ctx
      .switchToHttp()
      .getRequest<{ method: string; originalUrl: string; user?: { id: string } }>();
    if (!ttl || req.method !== 'GET' || !req.user) return next.handle();

    const key = `${req.user.id}|${req.originalUrl}`;
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expires > now) return of(hit.value);

    return next.handle().pipe(
      tap((value) => {
        if (this.store.size >= MAX_ENTRIES) {
          // En eski girdiyi at (Map ekleme sırasını korur).
          const oldest = this.store.keys().next().value;
          if (oldest !== undefined) this.store.delete(oldest);
        }
        this.store.delete(key);
        this.store.set(key, { expires: Date.now() + ttl * 1000, value });
      }),
    );
  }
}

/** `@ShortCache(30)`: GET yanıtını 30 sn bellekte tutar (kişi + adres başına). */
export const ShortCache = (seconds = 30) =>
  applyDecorators(SetMetadata(SHORT_CACHE_TTL, seconds), UseInterceptors(ShortCacheInterceptor));
