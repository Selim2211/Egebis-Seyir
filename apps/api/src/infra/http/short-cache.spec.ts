import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortCacheInterceptor } from './short-cache';

const ctx = (req: object, ttl: number | undefined): ExecutionContext =>
  ({
    getHandler: () => ttl,
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

describe('ShortCacheInterceptor', () => {
  let calls = 0;
  const handler: CallHandler = { handle: () => of({ n: ++calls }) };
  const reflector = { get: (_k: string, ttl: number | undefined) => ttl } as unknown as Reflector;
  let cache: ShortCacheInterceptor;

  beforeEach(() => {
    calls = 0;
    cache = new ShortCacheInterceptor(reflector);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  const get = (user: string, url: string, ttl = 30) =>
    firstValueFrom(
      cache.intercept(
        ctx({ method: 'GET', originalUrl: url, user: { id: user } }, ttl),
        handler,
      ) as never,
    );

  it('aynı kişi ve adres için TTL içinde işleyiciyi bir kez çalıştırır', async () => {
    expect(await get('u1', '/a?x=1')).toEqual({ n: 1 });
    expect(await get('u1', '/a?x=1')).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it('TTL dolunca yeniler', async () => {
    await get('u1', '/a');
    vi.advanceTimersByTime(31_000);
    expect(await get('u1', '/a')).toEqual({ n: 2 });
  });

  it('kişiler ve sorgular arasında paylaşılmaz (izin sızıntısı yok)', async () => {
    await get('u1', '/a');
    expect(await get('u2', '/a')).toEqual({ n: 2 });
    expect(await get('u1', '/a?x=2')).toEqual({ n: 3 });
  });

  it('GET dışı, oturumsuz ya da TTL işaretsiz isteği önbelleğe almaz', async () => {
    for (const [method, user, ttl] of [
      ['POST', { id: 'u' }, 30],
      ['GET', undefined, 30],
      ['GET', { id: 'u' }, undefined],
    ] as const) {
      calls = 0;
      const run = () =>
        firstValueFrom(
          cache.intercept(
            ctx({ method, originalUrl: '/z', user }, ttl as number | undefined),
            handler,
          ) as never,
        );
      await run();
      await run();
      expect(calls).toBe(2);
    }
  });
});
