import { createHmac } from 'node:crypto';
import type { Created, CreatedGitIntegration, WorkItemDetail } from '@scrum/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

describe('GitHub/GitLab bağlantısı (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const server = () => ctx.app.getHttpServer() as Parameters<typeof request>[0];

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

  const item = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    const listId = tree.spaces.find((s) => s.id === (res.body as Created).id)!.lists[0]!.id;
    return (
      (
        await owner
          .post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'Giriş' })
          .expect(201)
      ).body as Created
    ).id;
  };
  const integration = async (provider: 'GITHUB' | 'GITLAB') =>
    (await owner.post(api('/git-integrations'), { name: 'Repo', provider }).expect(201))
      .body as CreatedGitIntegration;
  const github = (
    id: string,
    secret: string,
    event: string,
    payload: object,
    signSecret = secret,
  ) => {
    const raw = JSON.stringify(payload);
    const signature = `sha256=${createHmac('sha256', signSecret).update(raw).digest('hex')}`;
    return request(server())
      .post(`/api/integrations/git/${id}`)
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', event)
      .set('X-Hub-Signature-256', signature)
      .send(raw);
  };
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;

  it('GitHub push: imzalı olay commit’i anahtarı geçen işe bağlar; aktivite yazılır', async () => {
    const itemId = await item();
    const { integration: hook, secret } = await integration('GITHUB');
    const res = await github(hook.id, secret, 'push', {
      repository: { full_name: 'acme/app' },
      commits: [
        {
          id: 'abcdef1234567',
          message: 'MOB-1 giriş formu\n\ndetay',
          url: 'https://g/c/1',
          author: { name: 'Elif' },
        },
        { id: 'fff0000', message: 'MOB-99 olmayan iş ve genel düzeltme', url: 'u' },
      ],
    }).expect(202);
    expect(res.body).toEqual({ linked: 1 });

    const links = (await detail(itemId)).gitLinks;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      provider: 'GITHUB',
      kind: 'COMMIT',
      repo: 'acme/app',
      ref: 'abcdef1',
      title: 'MOB-1 giriş formu',
      author: 'Elif',
    });
    const events = await ctx.prisma.activityEvent.findMany({
      where: { entityId: itemId, action: 'item.git_linked' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.actorId).toBeNull();

    // Aynı olay tekrar gelirse çoğalmaz.
    await github(hook.id, secret, 'push', {
      repository: { full_name: 'acme/app' },
      commits: [{ id: 'abcdef1234567', message: 'MOB-1 giriş formu', url: 'https://g/c/1' }],
    }).expect(202);
    expect((await detail(itemId)).gitLinks).toHaveLength(1);
  });

  it('PR açılır, birleştirilince durum güncellenir', async () => {
    const itemId = await item();
    const { integration: hook, secret } = await integration('GITHUB');
    const pr = (state: string, merged = false) => ({
      repository: { full_name: 'acme/app' },
      action: 'closed',
      pull_request: {
        number: 7,
        title: 'Giriş akışı',
        body: 'Closes MOB-1',
        state,
        merged,
        html_url: 'https://g/pr/7',
        user: { login: 'elif' },
        head: { ref: 'feature/giris' },
      },
    });
    await github(hook.id, secret, 'pull_request', pr('open')).expect(202);
    expect((await detail(itemId)).gitLinks[0]).toMatchObject({
      kind: 'PULL_REQUEST',
      ref: '7',
      state: 'OPEN',
    });
    await github(hook.id, secret, 'pull_request', pr('closed', true)).expect(202);
    const links = (await detail(itemId)).gitLinks;
    expect(links).toHaveLength(1);
    expect(links[0]!.state).toBe('MERGED');
    expect(
      await ctx.prisma.activityEvent.count({
        where: { entityId: itemId, action: 'item.git_updated' },
      }),
    ).toBe(1);
  });

  it('GitLab: gizli token ile merge request bağlanır', async () => {
    const itemId = await item();
    const { integration: hook, secret } = await integration('GITLAB');
    const body = {
      project: { path_with_namespace: 'g/p' },
      user: { username: 'ali' },
      object_attributes: { iid: 3, title: 'MOB-1 düzelt', state: 'opened', url: 'https://gl/mr/3' },
    };
    await request(server())
      .post(`/api/integrations/git/${hook.id}`)
      .set('X-Gitlab-Event', 'Merge Request Hook')
      .set('X-Gitlab-Token', 'yanlis')
      .send(body)
      .expect(401);
    await request(server())
      .post(`/api/integrations/git/${hook.id}`)
      .set('X-Gitlab-Event', 'Merge Request Hook')
      .set('X-Gitlab-Token', secret)
      .send(body)
      .expect(202);
    expect((await detail(itemId)).gitLinks[0]).toMatchObject({
      provider: 'GITLAB',
      ref: '3',
      state: 'OPEN',
    });
  });

  it('yanlış imza, devre dışı entegrasyon ve bilinmeyen kimlik reddedilir', async () => {
    await item();
    const { integration: hook, secret } = await integration('GITHUB');
    const payload = {
      repository: { full_name: 'a/b' },
      commits: [{ id: 'aaaaaaa', message: 'MOB-1 x', url: 'u' }],
    };
    await github(hook.id, secret, 'push', payload, 'baska-anahtar').expect(401);
    await request(server()).post(`/api/integrations/git/${hook.id}`).send(payload).expect(401);
    await github('0194ba6a-0001-7000-8000-000000000001', secret, 'push', payload).expect(401);
    await owner.patch(api(`/git-integrations/${hook.id}`), { enabled: false }).expect(204);
    await github(hook.id, secret, 'push', payload).expect(401);
    expect(await ctx.prisma.gitLink.count()).toBe(0);
  });

  it('yönetim yalnızca workspace yöneticisine; gizli anahtar listede görünmez', async () => {
    const { integration: hook } = await integration('GITHUB');
    const list = (await owner.get(api('/git-integrations')).expect(200)).body as {
      integrations: Array<{ id: string }>;
      receiverPath: string;
    };
    expect(list.integrations).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('ghs_');
    expect(list.receiverPath).toBe('/api/integrations/git');

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/git-integrations')).expect(403);
    await elif.post(api('/git-integrations'), { name: 'X', provider: 'GITHUB' }).expect(403);
    await owner.delete(api(`/git-integrations/${hook.id}`)).expect(204);
    await owner.delete(api(`/git-integrations/${hook.id}`)).expect(404);
  });
});
