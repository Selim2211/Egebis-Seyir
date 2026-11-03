import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass-123' };

describe('Tanılama (ADR-159)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
  });

  it('Super Admin raporu alır; sır içermez; istekler kaydedilir', async () => {
    await owner.get(api('/hierarchy')).expect(200);
    const res = await owner.get(api('/diagnostics')).expect(200);
    const report = res.body as {
      database: { ok: boolean; selectOneMs: number[] };
      requests: { lastHourCount: number; slowestRoutes: Array<{ route: string }> };
      app: { settings: Record<string, unknown> };
    };
    expect(report.database.ok).toBe(true);
    expect(report.database.selectOneMs).toHaveLength(5);
    expect(report.requests.lastHourCount).toBeGreaterThan(0);
    expect(report.requests.slowestRoutes.map((r) => r.route)).toContain(
      '/api/workspaces/:id/hierarchy',
    );
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toContain(process.env.SETTINGS_SECRET ?? '__yok__');
    expect(res.headers['server-timing']).toMatch(/^app;dur=/);
  });

  it('ping ve indirme testi; boyut sınırlanır', async () => {
    const ping = await owner.get(api('/diagnostics/ping')).expect(200);
    expect(ping.headers['cache-control']).toBe('no-store');
    const small = await owner.download(api('/diagnostics/payload?kb=16')).expect(200);
    expect((small.body as Buffer).length).toBe(16 * 1024);
    const capped = await owner.download(api('/diagnostics/payload?kb=999999')).expect(200);
    expect((capped.body as Buffer).length).toBe(4096 * 1024);
  });

  it('Super Admin olmayan erişemez', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
    await elif.get(api('/diagnostics')).expect(403);
    await elif.get(api('/diagnostics/ping')).expect(403);
  });
});
