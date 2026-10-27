import type {
  AnalyticsForecast,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };
const DAY = 86_400_000;

/** ADR-148: öngörü ve risk — sprint/Epic tahmini bitiş, kritik bekleme, yavaşlama, takılı iş, atanmamış Bug. */
describe('Analiz: öngörü ve risk (gerçek veritabanı)', { timeout: 60_000 }, () => {
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

  it('geride kalan sprint, Epic tahmini ve eşiklerden üretilen uyarılar hesaplanır', async () => {
    const created = await owner
      .post(api('/spaces'), { name: 'Öngörü', key: 'ONG', color: '#7C3AED' })
      .expect(201);
    const spaceId = (created.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const byCat = (c: string) => detail.statuses.find((s) => s.category === c)!.id;
    const done = byCat('DONE');
    const active = byCat('ACTIVE');
    const me = (await owner.get('/api/auth/me').expect(200)).body as { user: { id: string } };
    const item = async (body: Record<string, unknown>) =>
      (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;

    // Sprint işleri: 4 × 5 = 20 puan. Sprint kurulmadan önce oluşturulur (Scrum kuralı).
    const sp = await Promise.all(
      [1, 2, 3, 4].map((n) => item({ type: 'TASK', title: `S${n}`, points: 5 })),
    );
    // Epic: 8 puan açık + 3 puan biten çocuk.
    const epic = await item({ type: 'EPIC', title: 'Büyük Epic' });
    const c1 = await item({ type: 'TASK', title: 'E açık', points: 8, parentId: epic.id });
    const c2 = await item({ type: 'TASK', title: 'E biten', points: 3, parentId: epic.id });
    // Kişi yavaşlaması: 3 iş, 20 gün önce tamamlandı (önceki 14 günlük dönem).
    const old = await Promise.all(
      [1, 2, 3].map((n) => item({ type: 'TASK', title: `Eski ${n}`, assigneeIds: [me.user.id] })),
    );
    // Takılı iş: 3 iş "Yapılıyor"da, 20 gündür güncellenmedi.
    const stuck = await Promise.all(
      [1, 2, 3].map((n) => item({ type: 'TASK', title: `Takılı ${n}` })),
    );
    // Bekleyen Kritik Bug: 9 gün önce açıldı, atanmamış.
    const bug = (
      await owner
        .post(api(`/spaces/${spaceId}/bugs`), { title: 'Bekleyen kritik', severity: 'CRITICAL' })
        .expect(201)
    ).body as { id: string };

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const sprint = (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'Sprint X',
          goal: 'Hedef',
          startDate: iso(new Date()),
          endDate: iso(new Date(Date.now() + 13 * DAY)),
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), {
        itemIds: sp.map((s) => s.id),
        sprintId: sprint.id,
      })
      .expect(204);
    await owner.post(api(`/sprints/${sprint.id}/start`), {}).expect(204);

    const prisma = ctx.app.get(PrismaService);
    const now = Date.now();
    // Sprint 7 gün önce başlamış gibi (14 günün yarısı); 1 iş (5 puan) biter → %25 < beklenen %50.
    await prisma.sprint.update({
      where: { id: sprint.id },
      data: { startDate: new Date(now - 7 * DAY), endDate: new Date(now + 6 * DAY) },
    });
    await owner.patch(api(`/items/${sp[0]!.id}`), { statusId: done }).expect(204);
    await owner.patch(api(`/items/${c2.id}`), { statusId: done }).expect(204);
    for (const o of old) {
      await prisma.workItem.update({
        where: { id: o.id },
        data: { statusId: done, completedAt: new Date(now - 20 * DAY) },
      });
    }
    for (const s of stuck) {
      await prisma.workItem.update({
        where: { id: s.id },
        data: { statusId: active, updatedAt: new Date(now - 20 * DAY) },
      });
    }
    await prisma.workItem.update({
      where: { id: bug.id },
      data: { createdAt: new Date(now - 9 * DAY) },
    });
    void c1;

    const res = (await owner.get(api('/analytics/forecast')).expect(200)).body as AnalyticsForecast;

    // Sprint: 20 puan, 5 biten, 15 kalan; yarısı geçti, dörtte biri bitti → geride.
    expect(res.sprints).toHaveLength(1);
    expect(res.sprints[0]).toMatchObject({
      name: 'Sprint X',
      totalPoints: 20,
      donePoints: 5,
      remainingPoints: 15,
      daysLeft: 7,
      projectedPct: 50,
      state: 'behind',
    });
    expect(res.sprints[0]!.projectedFinish).not.toBeNull();

    // Epic: 11 puan, 3 biten, 8 kalan; Proje hızı son 28 günde (5 + 3) / 4 = 2 puan/hafta → 4 hafta.
    const e = res.epics.find((x) => x.title === 'Büyük Epic')!;
    expect(e).toMatchObject({
      totalPoints: 11,
      donePoints: 3,
      remainingPoints: 8,
      openItems: 1,
      ratePerWeek: 2,
      weeksLeft: 4,
    });
    expect(e.projectedFinish).not.toBeNull();

    // Uyarılar: önce yüksek seviye.
    const kinds = (level: string) => res.risks.filter((r) => r.level === level).map((r) => r.kind);
    expect(kinds('high')).toEqual(
      expect.arrayContaining(['sprint_behind', 'critical_waiting', 'person_slowing']),
    );
    expect(res.risks[0]!.level).toBe('high');
    const critical = res.risks.find((r) => r.kind === 'critical_waiting')!;
    expect(critical).toMatchObject({ subject: 'Bekleyen kritik', value: 9, level: 'high' });
    expect(critical.link).toMatchObject({ kind: 'item' });
    const person = res.risks.find((r) => r.kind === 'person_slowing')!;
    expect(person).toMatchObject({
      value: 0,
      previous: 3,
      level: 'high',
      link: { kind: 'person', id: me.user.id },
    });
    expect(res.risks.find((r) => r.kind === 'stuck_items')).toMatchObject({
      value: 3,
      level: 'medium',
    });
    expect(res.risks.find((r) => r.kind === 'unassigned_bugs')).toMatchObject({ value: 1 });
    // Proje yavaşlaması yok: önceki dönemde 5'ten az iş bitti.
    expect(res.risks.find((r) => r.kind === 'project_slowing')).toBeUndefined();
  });

  it('veri yoksa boş döner; yalnızca Owner/Admin görür', async () => {
    const empty = (await owner.get(api('/analytics/forecast')).expect(200))
      .body as AnalyticsForecast;
    expect(empty).toMatchObject({ sprints: [], epics: [], risks: [] });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/analytics/forecast')).expect(403);
  });
});
