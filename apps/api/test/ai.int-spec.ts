import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AiSplitSuggestion, AiStorySuggestion, AiSummary, Created } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

/** Ortam değişkenleri AppModule içe aktarılırken okunur; gerçek API'ye gitmemesi için en başta ayarlanır. */
const FAKE_PORT = vi.hoisted(() => {
  const port = 47831;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.AI_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.AI_RATE_LIMIT = '6';
  return port;
});

interface Seen {
  headers: IncomingMessage['headers'];
  body: { model: string; system: string; messages: Array<{ content: string }>; max_tokens: number };
}

describe('Yapay zekâ destekli öneriler (sahte model sunucusu)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let fake: Server;
  let seen: Seen[];
  let reply: { status: number; text: string };
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  beforeAll(async () => {
    fake = createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        seen.push({ headers: req.headers, body: JSON.parse(raw) as Seen['body'] });
        res.statusCode = reply.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ content: [{ type: 'text', text: reply.text }] }));
      });
    });
    await new Promise<void>((resolve) => fake.listen(FAKE_PORT, '127.0.0.1', resolve));
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
    fake.close();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_RATE_LIMIT;
  });
  beforeEach(async () => {
    seen = [];
    reply = { status: 200, text: 'Özet metni' };
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
  });

  const setup = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const spaceId = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const add = async (body: Record<string, unknown>) =>
      ((await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as Created).id;
    return { spaceId, listId, add };
  };

  it('durum: anahtar varsa etkin', async () => {
    expect((await owner.get(api('/ai/status')).expect(200)).body).toEqual({ enabled: true });
  });

  it('özet: işin metni <item> içinde modele gider; yanıt döner', async () => {
    const s = await setup();
    const id = await s.add({ type: 'TASK', title: 'Giriş hatasını düzelt' });
    await owner
      .post(api(`/items/${id}/comments`), {
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Üretimde tekrarlandı' }] },
          ],
        },
      })
      .expect(201);

    const res = (await owner.post(api(`/items/${id}/ai/summarize`), {}).expect(200))
      .body as AiSummary;
    expect(res.summary).toBe('Özet metni');
    const call = seen[0]!;
    expect(call.headers['x-api-key']).toBe('test-key');
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    expect(call.body.model).toBe('claude-sonnet-5-5');
    expect(call.body.system).toContain('untrusted');
    const content = call.body.messages[0]!.content;
    expect(content).toMatch(/^<item>/);
    expect(content).toContain('MOB-1');
    expect(content).toContain('Giriş hatasını düzelt');
    expect(content).toContain('Üretimde tekrarlandı');
  });

  it('hikâye ve kabul kriteri önerisi: kod çitli JSON çözülür', async () => {
    const s = await setup();
    const id = await s.add({ type: 'STORY', title: 'Kullanıcı giriş yapabilmeli' });
    reply.text =
      '```json\n{"description":"Bir kullanıcı olarak giriş yapmak istiyorum","acceptanceCriteria":["Given geçerli şifre When giriş Then panel açılır","Hatalı şifrede uyarı çıkar"]}\n```';
    const res = (await owner.post(api(`/items/${id}/ai/suggest-story`), {}).expect(200))
      .body as AiStorySuggestion;
    expect(res.acceptanceCriteria).toHaveLength(2);
    expect(res.description).toContain('giriş');
    // Öneri uygulanmaz: işin açıklaması değişmedi.
    expect((await ctx.prisma.workItem.findUniqueOrThrow({ where: { id } })).description).toBeNull();
  });

  it('Epic bölme önerisi yalnızca Epic için; diğer tipler 422', async () => {
    const s = await setup();
    const epic = await s.add({ type: 'EPIC', title: 'Ödeme sistemi' });
    const story = await s.add({ type: 'STORY', title: 'Tek hikaye' });
    reply.text =
      '{"stories":[{"title":"Kart ile ödeme","description":"Kart bilgileri alınır"},{"title":"Havale","description":"IBAN gösterilir"}]}';
    const res = (await owner.post(api(`/items/${epic}/ai/split-epic`), {}).expect(200))
      .body as AiSplitSuggestion;
    expect(res.stories.map((x) => x.title)).toEqual(['Kart ile ödeme', 'Havale']);
    const bad = await owner.post(api(`/items/${story}/ai/split-epic`), {}).expect(422);
    expect(bad.body).toEqual({ code: 'AI_NOT_APPLICABLE' });
    await owner.post(api(`/items/${epic}/ai/suggest-story`), {}).expect(422);
  });

  it('model hatası ve bozuk JSON 502 AI_FAILED; model çağrısı yapılan istek sayılır', async () => {
    const s = await setup();
    const id = await s.add({ type: 'STORY', title: 'Hikaye' });
    reply = { status: 500, text: 'x' };
    const down = await owner.post(api(`/items/${id}/ai/suggest-story`), {}).expect(502);
    expect(down.body).toEqual({ code: 'AI_FAILED' });
    reply = { status: 200, text: 'JSON değil' };
    await owner.post(api(`/items/${id}/ai/suggest-story`), {}).expect(502);
    reply = { status: 200, text: '{"description": 5}' };
    await owner.post(api(`/items/${id}/ai/suggest-story`), {}).expect(502);
  });

  it('dakikalık sınır aşılınca 429', async () => {
    const s = await setup();
    const id = await s.add({ type: 'TASK', title: 'İş' });
    for (let i = 0; i < 6; i += 1)
      await owner.post(api(`/items/${id}/ai/summarize`), {}).expect(200);
    const res = await owner.post(api(`/items/${id}/ai/summarize`), {}).expect(429);
    expect(res.body).toEqual({ code: 'AI_RATE_LIMITED' });
  });

  it('yetki: Stakeholder özetleyebilir ama öneri üretemez; görünmeyen iş 404', async () => {
    const s = await setup();
    const id = await s.add({ type: 'STORY', title: 'Hikaye' });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner
      .put(api(`/spaces/${s.spaceId}/members/${elifId}`), { role: 'STAKEHOLDER' })
      .expect(204);
    await elif.post(api(`/items/${id}/ai/summarize`), {}).expect(200);
    await elif.post(api(`/items/${id}/ai/suggest-story`), {}).expect(403);
    await owner
      .post(api('/items/0194ba6a-0001-7000-8000-000000000001/ai/summarize'), {})
      .expect(404);
  });
});
