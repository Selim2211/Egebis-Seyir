import { createServer, type IncomingMessage, type Server } from 'node:http';
import type {
  AiSplitSuggestion,
  AiSprintGoal,
  AiStorySuggestion,
  AiSummary,
  Created,
} from '@scrum/shared';
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
    expect((await owner.get(api('/ai/status')).expect(200)).body).toEqual({
      enabled: true,
      estimate: { enabled: true, minSentences: 5 },
      sprintGoal: { enabled: true },
    });
  });

  // ---------- ADR-175: ana anahtar, sprint hedefi, proje bağlamı ----------

  /** Geçmiş (tamamlanmış) bir sprint, içinde biten puanlı bir iş ve Backlog'da iki iş kurar. */
  const projectWithHistory = async () => {
    const s = await setup();
    await owner
      .patch(api(`/spaces/${s.spaceId}`), { description: 'Mobil bankacılık uygulaması' })
      .expect((r) => expect([200, 204]).toContain(r.status));
    const epic = await s.add({ type: 'EPIC', title: 'Para transferi' });
    const doneItem = await s.add({ type: 'TASK', title: 'IBAN doğrulama servisi' });
    const backlogA = await s.add({ type: 'TASK', title: 'Havale onay ekranı' });
    const backlogB = await s.add({ type: 'BUG', title: 'Bakiye yanlış yuvarlanıyor' });
    const done = await ctx.prisma.status.findFirstOrThrow({
      where: { spaceId: s.spaceId, category: 'DONE' },
    });
    const past = await ctx.prisma.sprint.create({
      data: {
        workspaceId: ws,
        spaceId: s.spaceId,
        name: 'Sprint 1',
        goal: 'Kullanıcılar IBAN girerek doğrulanmış bir alıcıya ilk havalesini hazırlayabilsin.',
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-10-14'),
        status: 'COMPLETED',
        completedAt: new Date('2026-10-14T17:00:00Z'),
        committedPoints: 8,
        completedPoints: 5,
      },
    });
    await ctx.prisma.workItem.update({
      where: { id: doneItem },
      data: {
        sprintId: past.id,
        statusId: done.id,
        points: 5,
        completedAt: new Date('2026-10-10'),
      },
    });
    return { ...s, epic, doneItem, backlogA, backlogB, past };
  };

  const LONG_GOAL =
    'Kullanıcılar havale onay ekranında tutarı ve alıcıyı görüp tek dokunuşla güvenle onaylayabilsin.';

  it('ana anahtar kapalıyken durum kapalı görünür ve hiçbir AI ucu modele gitmez', async () => {
    const s = await setup();
    const id = await s.add({ type: 'TASK', title: 'İş' });
    await owner.patch(api('/settings'), { aiEnabled: false }).expect(204);
    expect((await owner.get(api('/ai/status')).expect(200)).body).toMatchObject({ enabled: false });
    const off = await owner.post(api(`/items/${id}/ai/summarize`), {}).expect(422);
    expect(off.body).toEqual({ code: 'AI_TURNED_OFF' });
    await owner.post(api(`/items/${id}/ai/estimate`), {}).expect(422);
    await owner.post(api(`/spaces/${s.spaceId}/ai/sprint-goal`), { mode: 'SUGGEST' }).expect(422);
    expect(seen).toHaveLength(0);
    // Ayar denetim günlüğüne düşer.
    const log = await ctx.prisma.activityEvent.findFirst({
      where: { workspaceId: ws, action: 'workspace.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(log?.changes)).toContain('aiEnabled');
  });

  it('sprint hedefi AI ayrı kapatılabilir', async () => {
    const s = await setup();
    await owner.patch(api('/settings'), { aiSprintGoalEnabled: false }).expect(204);
    expect((await owner.get(api('/ai/status')).expect(200)).body).toMatchObject({
      enabled: true,
      sprintGoal: { enabled: false },
    });
    const res = await owner
      .post(api(`/spaces/${s.spaceId}/ai/sprint-goal`), { mode: 'SUGGEST' })
      .expect(422);
    expect(res.body).toEqual({ code: 'AI_SPRINT_GOAL_DISABLED' });
  });

  it("hedef önerisi: model projeyi, Epic'leri, geçmiş sprint'in hedefini ve teslim ettiğini okur", async () => {
    const p = await projectWithHistory();
    reply.text = JSON.stringify({ goal: LONG_GOAL, feedback: ['Havale akışını tamamlar'] });
    const res = (
      await owner
        .post(api(`/spaces/${p.spaceId}/ai/sprint-goal`), { mode: 'SUGGEST', name: 'Sprint 2' })
        .expect(200)
    ).body as AiSprintGoal;
    expect(res).toEqual({
      goal: LONG_GOAL,
      score: null,
      verdict: null,
      feedback: ['Havale akışını tamamlar'],
      meetsMinLength: true,
    });
    const content = seen[0]!.body.messages[0]!.content;
    expect(content).toMatch(/^<project>/);
    expect(content).toContain('Mobil bankacılık uygulaması');
    expect(content).toContain('Para transferi');
    expect(content).toContain('doğrulanmış bir alıcıya ilk havalesini');
    expect(content).toContain('IBAN doğrulama servisi — 5 SP');
    expect(content).toContain('Havale onay ekranı');
    expect(content).toContain('Sprint 2');
    expect(seen[0]!.body.system).toContain('64');
    // Öneri hiçbir şeyi kaydetmez.
    expect(await ctx.prisma.sprint.count({ where: { spaceId: p.spaceId } })).toBe(1);
  });

  it("hedef kontrolü: puan ve uyum döner; hedef <goal> içinde gider; sprint'in işleri bağlamda", async () => {
    const p = await projectWithHistory();
    const sprint = await ctx.prisma.sprint.create({
      data: {
        workspaceId: ws,
        spaceId: p.spaceId,
        name: 'Sprint 2',
        goal: 'Eski kayıtlı hedef metni',
        startDate: new Date('2026-11-16'),
        endDate: new Date('2026-11-29'),
      },
    });
    await ctx.prisma.workItem.update({ where: { id: p.backlogA }, data: { sprintId: sprint.id } });
    reply.text =
      '```json\n{"score": 42, "verdict": "PARTIAL", "feedback": ["Bakiye hatası hedefte yok"], "goal": "Kısa"}\n```';
    const res = (
      await owner
        .post(api(`/spaces/${p.spaceId}/ai/sprint-goal`), {
          mode: 'CHECK',
          sprintId: sprint.id,
          goal: 'Kripto para borsası entegrasyonu',
        })
        .expect(200)
    ).body as AiSprintGoal;
    expect(res).toMatchObject({
      score: 42,
      verdict: 'PARTIAL',
      goal: 'Kısa',
      meetsMinLength: false,
    });
    const content = seen[0]!.body.messages[0]!.content;
    expect(content).toContain('<goal>\nKripto para borsası entegrasyonu\n</goal>');
    expect(content).toContain('Items planned in this sprint');
    expect(content).toContain('Havale onay ekranı');
    expect(content).not.toContain('Eski kayıtlı hedef metni');
    expect(seen[0]!.body.system).toContain('OFF_TRACK');
  });

  it("hedef kontrolü hedefsiz 400; başka Projenin sprint'i 404; Proje Üyesi 403", async () => {
    const p = await projectWithHistory();
    await owner.post(api(`/spaces/${p.spaceId}/ai/sprint-goal`), { mode: 'CHECK' }).expect(400);
    const other = (
      (await owner.post(api('/spaces'), { name: 'Web', key: 'WEB', color: '#0EA5E9' }).expect(201))
        .body as Created
    ).id;
    await owner
      .post(api(`/spaces/${other}/ai/sprint-goal`), { mode: 'SUGGEST', sprintId: p.past.id })
      .expect(404);
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner
      .put(api(`/spaces/${p.spaceId}/members/${elifId}`), { role: 'PROJECT_MEMBER' })
      .expect(204);
    await elif.post(api(`/spaces/${p.spaceId}/ai/sprint-goal`), { mode: 'SUGGEST' }).expect(403);
    expect(seen).toHaveLength(0);
  });

  it('Story Point tahmini 34 önerebilir ve ekibin geçmiş puanlarıyla proje bağlamını okur', async () => {
    const p = await projectWithHistory();
    await owner
      .patch(api(`/items/${p.backlogA}`), {
        description: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Ekran tutarı gösterir. Alıcı adı görünür. Onay düğmesi vardır. Hata mesajı çıkar. Sonuç kaydedilir.',
                },
              ],
            },
          ],
        },
      })
      .expect(204);
    reply.text = '{"points": 34, "confidence": "LOW", "reason": "Çok büyük"}';
    const res = (await owner.post(api(`/items/${p.backlogA}/ai/estimate`), {}).expect(200))
      .body as { points: number };
    expect(res.points).toBe(34);
    const content = seen[0]!.body.messages[0]!.content;
    expect(content).toMatch(/^<project>/);
    expect(content).toContain("Team's past estimates");
    expect(content).toContain('IBAN doğrulama servisi — 5 SP');
    expect(content).toContain('<item>');
    expect(seen[0]!.body.system).toContain('34');
    // Ölçek dışı değer reddedilir.
    reply.text = '{"points": 89, "confidence": "LOW", "reason": "x"}';
    await owner.post(api(`/items/${p.backlogA}/ai/estimate`), {}).expect(502);
  });

  it('sprint hedefi: boş olabilir; yazılırsa en az 64 karakter (oluşturma ve düzenleme)', async () => {
    const s = await setup();
    const base = { name: 'Sprint 1', startDate: '2026-11-16', endDate: '2026-11-29' };
    await owner
      .post(api(`/spaces/${s.spaceId}/sprints`), { ...base, goal: 'Kısa hedef' })
      .expect(400);
    await owner.post(api(`/spaces/${s.spaceId}/sprints`), { ...base, goal: '' }).expect(201);
    const id = (
      (
        await owner
          .post(api(`/spaces/${s.spaceId}/sprints`), { ...base, goal: LONG_GOAL })
          .expect(201)
      ).body as Created
    ).id;
    await owner.patch(api(`/sprints/${id}`), { goal: 'Yine kısa' }).expect(400);
    await owner
      .patch(api(`/sprints/${id}`), { goal: null })
      .expect((r) => expect(r.status).toBeLessThan(300));
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
    const id = await s.add({ type: 'TASK', title: 'Kullanıcı giriş yapabilmeli' });
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
    const story = await s.add({ type: 'TASK', title: 'Tek hikaye' });
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
    const id = await s.add({ type: 'TASK', title: 'Hikaye' });
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
    const id = await s.add({ type: 'TASK', title: 'Hikaye' });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.spaceId}/members/${elifId}`), { role: 'VIEWER' }).expect(204);
    await elif.post(api(`/items/${id}/ai/summarize`), {}).expect(200);
    await elif.post(api(`/items/${id}/ai/suggest-story`), {}).expect(403);
    await owner
      .post(api('/items/0194ba6a-0001-7000-8000-000000000001/ai/summarize'), {})
      .expect(404);
  });
});
