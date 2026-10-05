import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type {
  Created,
  CreatedWebhook,
  SpaceDetail,
  WebhookDeliveriesResponse,
  WebhooksResponse,
} from '@scrum/shared';
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

interface Received {
  headers: IncomingMessage['headers'];
  raw: string;
  json: Record<string, unknown>;
}

describe('Giden webhook’lar (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let receiver: Server;
  let url: string;
  let received: Received[];
  let respondWith = 200;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  beforeAll(async () => {
    ctx = await createTestApp();
    receiver = createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        received.push({
          headers: req.headers,
          raw,
          json: JSON.parse(raw || '{}') as Record<string, unknown>,
        });
        res.statusCode = respondWith;
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    const address = receiver.address() as { port: number };
    url = `http://127.0.0.1:${address.port}/hook`;
  });
  afterAll(async () => {
    receiver.close();
    await ctx.app.close();
  });
  beforeEach(async () => {
    received = [];
    respondWith = 200;
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
  });

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    const detail = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
    return {
      id,
      listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id,
      statuses: Object.fromEntries(detail.statuses.map((s) => [s.name, s.id])) as Record<
        string,
        string
      >,
    };
  };
  const hook = async (spaceId: string, body: Record<string, unknown> = {}) =>
    (
      await owner
        .post(api(`/spaces/${spaceId}/webhooks`), {
          name: 'Test',
          url,
          events: ['item.created', 'item.status_changed'],
          ...body,
        })
        .expect(201)
    ).body as CreatedWebhook;
  const addItem = async (listId: string) =>
    (
      (await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'İş' }).expect(201))
        .body as Created
    ).id;
  const deliveries = async (spaceId: string, id: string) =>
    (await owner.get(api(`/spaces/${spaceId}/webhooks/${id}/deliveries`)).expect(200))
      .body as WebhookDeliveriesResponse;

  it('olay imzalı JSON olarak gönderilir; teslimat günlüğüne OK yazılır', async () => {
    const s = await space();
    const created = await hook(s.id);
    expect(created.secret).toMatch(/^whsec_/);

    const itemId = await addItem(s.listId);
    expect(received).toHaveLength(1);
    const first = received[0]!;
    expect(first.headers['x-scrum-event']).toBe('item.created');
    expect(first.json).toMatchObject({
      event: 'item.created',
      space: { key: 'MOB' },
      item: { key: 'MOB-1', title: 'İş', type: 'TASK' },
      actor: { name: 'Zeynep Kaya' },
    });
    const timestamp = first.headers['x-scrum-timestamp'] as string;
    const expected = createHmac('sha256', created.secret!)
      .update(`${timestamp}.${first.raw}`)
      .digest('hex');
    expect(first.headers['x-scrum-signature']).toBe(`sha256=${expected}`);

    await owner
      .patch(api(`/items/${itemId}`), { statusId: s.statuses['Devam ediyor'] })
      .expect(204);
    expect(received.map((r) => r.headers['x-scrum-event'])).toEqual([
      'item.created',
      'item.status_changed',
    ]);
    expect(received[1]!.json).toMatchObject({ item: { status: 'Devam ediyor' } });

    const log = (await deliveries(s.id, created.webhook.id)).deliveries;
    expect(log.map((d) => d.status)).toEqual(['OK', 'OK']);
    expect(log[0]).toMatchObject({ attempts: 1, responseStatus: 200 });
  });

  it('seçilmeyen olay, devre dışı webhook ve başka Space gönderilmez', async () => {
    const s = await space();
    const other = await space2();
    const created = await hook(s.id, { events: ['sprint.started'] });
    await addItem(s.listId);
    expect(received).toHaveLength(0);

    await owner
      .patch(api(`/spaces/${s.id}/webhooks/${created.webhook.id}`), { events: ['item.created'] })
      .expect(204);
    await addItem(other.listId);
    expect(received).toHaveLength(0);
    await owner
      .patch(api(`/spaces/${s.id}/webhooks/${created.webhook.id}`), { enabled: false })
      .expect(204);
    await addItem(s.listId);
    expect(received).toHaveLength(0);
  });

  async function space2() {
    const res = await owner
      .post(api('/spaces'), { name: 'Web', key: 'WEB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  }

  it('alıcı hata verirse teslimat FAILED olarak kaydedilir; asıl işlem etkilenmez', async () => {
    const s = await space();
    const created = await hook(s.id);
    respondWith = 500;
    await addItem(s.listId);
    const log = (await deliveries(s.id, created.webhook.id)).deliveries;
    expect(log[0]).toMatchObject({ status: 'FAILED', responseStatus: 500, error: 'HTTP_500' });
    expect(await ctx.prisma.workItem.count()).toBe(1);
  });

  it('yorum ve sprint olayları gelir; test (ping) gönderilir', async () => {
    const s = await space();
    const created = await hook(s.id, { events: ['comment.created', 'sprint.started'] });
    const itemId = await addItem(s.listId);
    await owner
      .post(api(`/items/${itemId}/comments`), {
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merhaba' }] }],
        },
      })
      .expect(201);
    expect(received.map((r) => r.headers['x-scrum-event'])).toEqual(['comment.created']);

    const sprint = (
      await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'Sprint 1',
          goal: 'Hedef',
          startDate: '2026-11-02',
          endDate: '2026-11-15',
        })
        .expect(201)
    ).body as Created;
    await owner.post(api(`/sprints/${sprint.id}/start`), {}).expect(204);
    expect(received.at(-1)!.json).toMatchObject({
      event: 'sprint.started',
      sprint: { name: 'Sprint 1' },
    });

    await owner.post(api(`/spaces/${s.id}/webhooks/${created.webhook.id}/test`), {}).expect(204);
    expect(received.at(-1)!.headers['x-scrum-event']).toBe('ping');
  });

  it('Slack ve Teams biçimleri sohbet mesajı gönderir; imza ve gizli anahtar yoktur', async () => {
    const s = await space();
    const slack = await hook(s.id, { name: 'Slack', format: 'SLACK', events: ['item.created'] });
    expect(slack.secret).toBeNull();
    await addItem(s.listId);
    expect(received).toHaveLength(1);
    expect(received[0]!.headers['x-scrum-signature']).toBeUndefined();
    const text = received[0]!.json.text as string;
    expect(text).toContain('MOB-1');
    expect(text).toContain('Zeynep Kaya');
    expect(text).toMatch(/^<http.*\/items\/MOB-1\|/);

    await owner.delete(api(`/spaces/${s.id}/webhooks/${slack.webhook.id}`)).expect(204);
    received.length = 0;
    await hook(s.id, { name: 'Teams', format: 'TEAMS', events: ['item.created'] });
    await addItem(s.listId);
    const card = received[0]!.json as {
      type: string;
      attachments: Array<{
        contentType: string;
        content: { type: string; body: Array<{ text: string }> };
      }>;
    };
    expect(card.type).toBe('message');
    expect(card.attachments[0]!.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.attachments[0]!.content.body[0]!.text).toContain('MOB-2');
  });

  it('doğrulama: engellenen adres, geçersiz olay, sınır ve yetki', async () => {
    const s = await space();
    const blocked = await owner
      .post(api(`/spaces/${s.id}/webhooks`), {
        name: 'X',
        url: 'http://169.254.169.254/latest',
        events: ['item.created'],
      })
      .expect(422);
    expect(blocked.body).toEqual({ code: 'WEBHOOK_URL_BLOCKED' });
    await owner
      .post(api(`/spaces/${s.id}/webhooks`), { name: 'X', url, events: ['yok.olay'] })
      .expect(400);
    await owner.post(api(`/spaces/${s.id}/webhooks`), { name: 'X', url, events: [] }).expect(400);
    for (let i = 0; i < 10; i += 1) await hook(s.id, { name: `H${i}` });
    const over = await owner
      .post(api(`/spaces/${s.id}/webhooks`), { name: 'Fazla', url, events: ['item.created'] })
      .expect(409);
    expect(over.body).toEqual({ code: 'WEBHOOK_LIMIT' });

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
    await elif.get(api(`/spaces/${s.id}/webhooks`)).expect(403);
    const list = (await owner.get(api(`/spaces/${s.id}/webhooks`)).expect(200))
      .body as WebhooksResponse;
    expect(JSON.stringify(list)).not.toContain('whsec_');
  });
});
