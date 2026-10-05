import type { ApiTokensResponse, CreatedApiToken } from '@scrum/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

describe('Kişisel API token’ları (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => ctx.app.getHttpServer() as Parameters<typeof request>[0];

  const create = async (body: Record<string, unknown> = {}) =>
    (await owner.post('/api/tokens', { name: 'CI', ...body }).expect(201)).body as CreatedApiToken;

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

  it('token oluşturulur, düz değer yalnızca bir kez görünür, listede önek görünür', async () => {
    const made = await create({ expiresInDays: 30 });
    expect(made.token).toMatch(/^smt_/);
    expect(made.info.prefix).toBe(made.token.slice(0, 10));
    expect(made.info.expiresAt).not.toBeNull();

    const list = (await owner.get('/api/tokens').expect(200)).body as ApiTokensResponse;
    expect(list.tokens).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(made.token);
    const row = await ctx.prisma.apiToken.findFirstOrThrow();
    expect(row.tokenHash).not.toContain(made.token);
  });

  it('Bearer token kullanıcı adına çalışır; CSRF gerekmez; son kullanım yazılır', async () => {
    const { token } = await create();
    const me = await request(server()).get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(403); // /auth uçları token ile yasak

    const hier = await request(server()).get(api('/hierarchy')).set(bearer(token)).expect(200);
    expect(hier.body).toHaveProperty('spaces');

    const created = await request(server())
      .post(api('/spaces'))
      .set(bearer(token))
      .send({ name: 'Token Space', key: 'TOK', color: '#7C3AED' })
      .expect(201);
    expect((created.body as { id: string }).id).toBeTruthy();
    expect((await ctx.prisma.apiToken.findFirstOrThrow()).lastUsedAt).not.toBeNull();
  });

  it('salt okunur token yazamaz; token token yönetemez', async () => {
    const { token } = await create({ readOnly: true });
    await request(server()).get(api('/hierarchy')).set(bearer(token)).expect(200);
    const res = await request(server())
      .post(api('/spaces'))
      .set(bearer(token))
      .send({ name: 'X', key: 'XXX', color: '#7C3AED' })
      .expect(403);
    expect(res.body).toEqual({ code: 'TOKEN_READ_ONLY' });
    const manage = await request(server())
      .post('/api/tokens')
      .set(bearer(token))
      .send({ name: 'Y' });
    expect(manage.status).toBe(403);
    expect(manage.body).toEqual({ code: 'TOKEN_NOT_ALLOWED' });
  });

  it('iptal edilen, süresi dolan ve bozuk token reddedilir', async () => {
    const { token, info } = await create();
    await owner.delete(`/api/tokens/${info.id}`).expect(204);
    await request(server()).get(api('/hierarchy')).set(bearer(token)).expect(401);

    const second = await create();
    await ctx.prisma.apiToken.update({
      where: { id: second.info.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(server()).get(api('/hierarchy')).set(bearer(second.token)).expect(401);
    await request(server()).get(api('/hierarchy')).set(bearer('smt_yanlis')).expect(401);
    expect(((await owner.get('/api/tokens').expect(200)).body as ApiTokensResponse).tokens).toEqual(
      [],
    );
  });

  it('en çok 20 etkin token; başkasının token’ı iptal edilemez', async () => {
    for (let i = 0; i < 20; i += 1) await create({ name: `T${i}` });
    const over = await owner.post('/api/tokens', { name: 'Fazla' }).expect(409);
    expect(over.body).toEqual({ code: 'API_TOKEN_LIMIT' });
    await owner.delete('/api/tokens/0194ba6a-0001-7000-8000-000000000001').expect(404);
  });
});
