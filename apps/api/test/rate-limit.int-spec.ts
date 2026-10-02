import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Uygulama modülü içe aktarılmadan önce düşük sınır verilir.
vi.hoisted(() => {
  process.env.AUTH_RATE_LIMIT = '3';
});

import { Client, createTestApp, resetState, type TestContext } from './helpers';

describe('Oran sınırlama (brief §12)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetState(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('giriş denemeleri dakikada AUTH_RATE_LIMIT ile sınırlıdır; diğer uçlar etkilenmez', async () => {
    const client = await Client.create(ctx.app);
    for (let i = 0; i < 3; i++) {
      await client.post('/api/auth/login', { email: 'x@example.com', password: 'x' }).expect(401);
    }
    const blocked = await client
      .post('/api/auth/login', { email: 'x@example.com', password: 'x' })
      .expect(429);
    expect(blocked.body).toEqual({ code: 'RATE_LIMITED' });

    await client.get('/api/setup/status').expect(200);
  });
});
