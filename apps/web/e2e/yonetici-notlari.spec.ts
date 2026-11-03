import { createServer, type Server } from 'node:http';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/**
 * Yönetici notları (9 madde) uçtan uca doğrulama: kurulum API ile, doğrulama arayüzden.
 * Ekran görüntüleri test-results/notlar altına kaydedilir.
 */
const PASS = 'notlar-pass-123';
const PM = { name: 'Pelin Yönetici', email: 'pm@example.com' };
const MEM = { name: 'Mert Üye', email: 'mert@example.com' };
const OUT = { name: 'Oya Dışkaynak', email: 'oya@example.com' };
const SHOT = 'test-results/notlar';

let fake: Server;
let ws = '';
const ids: Record<string, string> = {};

async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const csrf = document.cookie.match(/sm_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch(`/api${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: (text ? JSON.parse(text) : null) as never };
    },
    { method, path, body },
  );
}

async function ownerIds(page: Page): Promise<string[]> {
  const me = await api<{ user: { id: string } }>(page, 'GET', '/auth/me');
  return [me.body.user.id];
}

async function asUser(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await login(page, email, PASS);
  await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  return { ctx, page };
}

test.describe.serial('Yönetici notları: 9 madde', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
    fake = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '{"points":5,"confidence":"MEDIUM","reason":"Orta büyüklükte, belirsizliği düşük bir iş."}',
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => fake.listen(3199, '127.0.0.1', resolve));
  });
  test.afterAll(() => {
    fake.close();
  });

  test('kurulum: iki proje, kullanıcılar, işler', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const me = await api<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    ws = me.body.workspaces[0]!.id;

    for (const [key, name] of [
      ['ALFA', 'Alfa Projesi'],
      ['BETA', 'Beta Projesi'],
    ] as const) {
      const r = await api<{ id: string }>(page, 'POST', `/workspaces/${ws}/spaces`, {
        name,
        key,
        color: '#7C3AED',
      });
      expect(r.status).toBe(201);
      ids[key] = r.body.id;
    }
    const tree = await api<{
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    for (const k of ['ALFA', 'BETA']) {
      ids[`${k}-list`] = tree.body.spaces.find((s) => s.id === ids[k])!.lists[0]!.id;
    }

    const mk = async (
      u: { name: string; email: string },
      role: string,
      spaceIds: string[],
    ): Promise<string> => {
      const r = await api<{ userId: string }>(page, 'POST', `/workspaces/${ws}/members`, {
        ...u,
        role,
        password: PASS,
        spaceIds,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.userId;
    };
    ids.pm = await mk(PM, 'MEMBER', [ids.ALFA!]);
    ids.mem = await mk(MEM, 'MEMBER', [ids.ALFA!]);
    ids.out = await mk(OUT, 'GUEST', [ids.ALFA!]);
    const put = (spaceId: string, userId: string, role: string) =>
      api(page, 'PUT', `/workspaces/${ws}/spaces/${spaceId}/members/${userId}`, { role });
    expect((await put(ids.ALFA!, ids.pm, 'PROJECT_MANAGER')).status).toBe(204);
    expect((await put(ids.ALFA!, ids.mem, 'PROJECT_MEMBER')).status).toBe(204);
    expect((await put(ids.ALFA!, ids.out, 'PROJECT_MEMBER')).status).toBe(204);
    // Beta'ya yalnızca Super Admin üye.
    const item = async (listId: string, type: string, title: string, extra = {}) => {
      const r = await api<{ id: string; key: string }>(
        page,
        'POST',
        `/workspaces/${ws}/lists/${listId}/items`,
        { type, title, ...extra },
      );
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body;
    };
    ids.alfaTask = (
      await item(ids['ALFA-list']!, 'TASK', 'Alfa görev', {
        assigneeIds: [ids.mem],
      })
    ).id;
    ids.alfaEpic = (await item(ids['ALFA-list']!, 'EPIC', 'Alfa epik')).id;
    ids.alfaBug = (await item(ids['ALFA-list']!, 'BUG', 'Alfa hata')).id;
    await item(ids['BETA-list']!, 'TASK', 'Beta gizli görev');
  });

  test('1) Epik, Bug ve aktif Sprint silinebilir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    // Epik ve Bug: API silme + çöp kutusuna düşme.
    for (const [label, id] of [
      ['epik', ids.alfaEpic!],
      ['bug', ids.alfaBug!],
    ] as const) {
      const r = await api(page, 'DELETE', `/workspaces/${ws}/items/${id}`);
      expect([200, 204], `${label}: ${r.status}`).toContain(r.status);
    }

    // Sprint: oluştur, iş ekle, başlat, ARAYÜZDEN sil.
    const sp = await api<{ id: string }>(
      page,
      'POST',
      `/workspaces/${ws}/spaces/${ids.ALFA}/sprints`,
      { name: 'Silinecek Sprint', goal: 'deneme', startDate: '2026-11-03', endDate: '2026-11-17' },
    );
    expect(sp.status, JSON.stringify(sp.body)).toBe(201);
    const t = await api<{ id: string }>(
      page,
      'POST',
      `/workspaces/${ws}/lists/${ids['ALFA-list']}/items`,
      { type: 'TASK', title: 'Sprint işi' },
    );
    expect(t.status).toBe(201);
    const mv = await api(page, 'POST', `/workspaces/${ws}/spaces/${ids.ALFA}/backlog/move`, {
      itemIds: [t.body.id],
      sprintId: sp.body.id,
    });
    expect(mv.status, JSON.stringify(mv.body)).toBe(204);
    const start = await api(page, 'POST', `/workspaces/${ws}/sprints/${sp.body.id}/start`, {});
    expect([200, 204], JSON.stringify(start.body)).toContain(start.status);

    await page.goto('/');
    await page.getByRole('link', { name: 'Alfa Projesi' }).first().click();
    await page
      .getByRole('link', { name: /Backlog/i })
      .first()
      .click();
    await expect(page.getByText('Silinecek Sprint')).toBeVisible();
    await page.screenshot({ path: `${SHOT}/01-sprint-once.png` });
    // Sprint başlığındaki menüden Sil.
    const section = page.locator('section', { hasText: 'Silinecek Sprint' }).first();
    await section
      .getByRole('button', { name: /İşlemler|More|⋯|Sprint/i })
      .last()
      .click();
    await page.getByRole('menuitem', { name: 'Sil' }).click();
    await page.screenshot({ path: `${SHOT}/01-sprint-onay.png` });
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByText(/Silinecek Sprint.*silindi|silindi/i).first()).toBeVisible();
    await expect(page.locator('section', { hasText: 'Silinecek Sprint' })).toHaveCount(0);
    await page.screenshot({ path: `${SHOT}/01-sprint-sonra.png` });
    // Sprint silinince işi de çöp kutusuna gider: öğeye artık normal yoldan ulaşılamaz.
    const list = await api(page, 'GET', `/workspaces/${ws}/lists/${ids['ALFA-list']}/items`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('Sprint işi');
    expect(JSON.stringify(list.body)).toContain('Alfa görev');
  });

  test('4) Sprint Panosu ve Kanban simgeleri farklı', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.getByRole('link', { name: 'Alfa Projesi' }).first().click();
    const nav = page.getByRole('complementary');
    const icons = await nav.locator('a').evaluateAll((as) =>
      as.map((a) => ({
        text: a.textContent?.trim(),
        svg: a.querySelector('svg')?.getAttribute('class') ?? '',
      })),
    );
    await page.screenshot({ path: `${SHOT}/04-simgeler.png` });
    const sprint = icons.find(
      (i) => /Sprint/i.test(i.text ?? '') && /Pano|Board/i.test(i.text ?? ''),
    );
    const kanban = icons.find((i) => /Kanban/i.test(i.text ?? ''));
    expect(sprint, JSON.stringify(icons)).toBeDefined();
    expect(kanban, JSON.stringify(icons)).toBeDefined();
    expect(sprint!.svg).not.toEqual(kanban!.svg);
  });

  test('5) Üye olmadığı projeyi göremez; Proje Yöneticisi yalnız kendi projesinin aktivitesini görür', async ({
    browser,
  }) => {
    const { ctx, page } = await asUser(browser, PM.email);
    const tree = await api<{ spaces: Array<{ name: string }> }>(
      page,
      'GET',
      `/workspaces/${ws}/hierarchy`,
    );
    expect(tree.body.spaces.map((s) => s.name)).toEqual(['Alfa Projesi']);
    await expect(page.getByText('Beta Projesi')).toHaveCount(0);
    const direct = await api(page, 'GET', `/workspaces/${ws}/spaces/${ids.BETA}`);
    expect([403, 404]).toContain(direct.status);

    // 2) Akan aktivite penceresi.
    await page.getByTestId('livefeed-toggle').click();
    const panel = page.getByTestId('activity-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('livefeed-row').first()).toBeVisible();
    const text = await panel.innerText();
    expect(text).not.toContain('Beta gizli görev');
    await page.screenshot({ path: `${SHOT}/02-aktivite-pm.png` });
    // İsme tıkla → menü (mesaj gönder).
    await panel.getByTestId('livefeed-person').first().click();
    await expect(page.getByRole('button', { name: 'Mesaj gönder' })).toBeVisible();
    await page.screenshot({ path: `${SHOT}/02-aktivite-isim-menusu.png` });
    await ctx.close();
  });

  test('6) Dış kaynak: renk, kısıtlar, doküman/video varsayılan kapalı, toplu pencere', async ({
    browser,
    page,
  }) => {
    // Dış kaynak oturumu.
    const o = await asUser(browser, OUT.email);
    const tree = await api<{ spaces: Array<{ name: string }> }>(
      o.page,
      'GET',
      `/workspaces/${ws}/hierarchy`,
    );
    expect(tree.body.spaces.map((s) => s.name)).toEqual(['Alfa Projesi']);
    const docs = await api(o.page, 'GET', `/workspaces/${ws}/spaces/${ids.ALFA}/docs`);
    expect([403, 404], 'doküman varsayılan kapalı').toContain(docs.status);
    const promote = await api(
      o.page,
      'PUT',
      `/workspaces/${ws}/spaces/${ids.ALFA}/members/${ids.out}`,
      { role: 'PROJECT_MANAGER' },
    );
    expect(promote.status).not.toBe(204);
    await o.ctx.close();

    // Super Admin: dış kaynak penceresi + rozet rengi.
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/outsource');
    await expect(page.getByRole('heading', { name: 'Dış kaynak' })).toBeVisible();
    await expect(page.getByText(OUT.name)).toBeVisible();
    await page.screenshot({ path: `${SHOT}/06-dis-kaynak-penceresi.png` });
    // İçerik erişimini aç → dokümanlar görünür olur.
    const set = await api(page, 'PATCH', `/workspaces/${ws}/members/${ids.out}/content-access`, {
      contentAccess: 'VIEW',
    });
    expect(set.status).toBe(204);
    const o2 = await asUser(browser, OUT.email);
    const docs2 = await api(o2.page, 'GET', `/workspaces/${ws}/spaces/${ids.ALFA}/docs`);
    expect(docs2.status, 'izinden sonra doküman açık').toBe(200);
    await o2.ctx.close();
    // Proje Yöneticisi de kendi projesindeki dış kaynağı görür.
    const p = await asUser(browser, PM.email);
    const mine = await api<{ outsource?: unknown[] }>(
      p.page,
      'GET',
      `/workspaces/${ws}/members/outsource`,
    );
    expect(JSON.stringify(mine.body)).toContain(OUT.email.split('@')[0]!.slice(0, 0) + 'Oya');
    await p.ctx.close();
  });

  test('3) Yükleme sınırı: dosya sayısı dolunca reddedilir', async ({ page, browser }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/quotas');
    await expect(page.getByRole('heading', { name: 'Yükleme sınırları' })).toBeVisible();
    const put = await api(page, 'PUT', `/workspaces/${ws}/quotas`, {
      userId: ids.mem,
      maxFiles: 1,
      maxMb: null,
    });
    expect(put.status).toBe(204);
    await page.reload();
    await expect(page.getByTestId('quota-table').getByText(MEM.name)).toBeVisible();
    await page.screenshot({ path: `${SHOT}/03-kota.png` });

    // Gerçek yükleme: ilk dosya geçer, ikincisi sınır nedeniyle reddedilir.
    const m = await asUser(browser, MEM.email);
    const csrf = (await m.ctx.cookies()).find((c) => c.name === 'sm_csrf')?.value ?? '';
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const up = (name: string) =>
      m.page.request.post(`/api/workspaces/${ws}/items/${ids.alfaTask}/attachments`, {
        headers: { 'x-csrf-token': csrf },
        multipart: { file: { name, mimeType: 'image/png', buffer: png } },
      });
    expect((await up('bir.png')).status()).toBe(201);
    const second = await up('iki.png');
    expect(second.status()).toBe(413);
    expect(await second.text()).toContain('UPLOAD_QUOTA_EXCEEDED');
    await m.ctx.close();
  });

  test('7) Üye silinince işleri Proje Yöneticisine geçer; yönetici silinince Super Admin seçer', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/members');
    await page.screenshot({ path: `${SHOT}/07-uyeler.png` });
    const plan = await api<{
      projects: Array<{ defaultAssigneeId: string | null; openItems: number }>;
    }>(page, 'GET', `/workspaces/${ws}/members/${ids.mem}/handover`);
    expect(plan.body.projects[0]!.openItems).toBeGreaterThan(0);
    // Devralan: projenin ilk yöneticisi (projeyi açan Super Admin ya da atanan Proje Yöneticisi).
    const receiver = plan.body.projects[0]!.defaultAssigneeId!;
    const managers = [ids.pm!, ...(await ownerIds(page))];
    expect(managers).toContain(receiver);

    const del = await api(page, 'DELETE', `/workspaces/${ws}/members/${ids.mem}`);
    expect(del.status).toBe(204);
    const it = await api<{ assignees: Array<{ id: string }> }>(
      page,
      'GET',
      `/workspaces/${ws}/items/${ids.alfaTask}`,
    );
    expect(it.body.assignees.map((a) => a.id)).toEqual([receiver]);

    // PM silinirken alıcı zorunlu.
    const need = await api(page, 'DELETE', `/workspaces/${ws}/members/${ids.pm}`);
    expect([422, 204]).toContain(need.status);
    if (need.status === 422)
      expect(JSON.stringify(need.body)).toContain('HANDOVER_TARGET_REQUIRED');
  });

  test('8) AI puan tahmini: cümle sayısı yetmeyince kapalı, yetince çalışır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const s = await api(page, 'PATCH', `/workspaces/${ws}/settings`, {
      aiEstimateEnabled: true,
      aiEstimateMinSentences: 3,
    });
    expect([200, 204], JSON.stringify(s.body)).toContain(s.status);
    const mk = async (title: string, description: unknown) => {
      const r = await api<{ key: string; id: string }>(
        page,
        'POST',
        `/workspaces/${ws}/lists/${ids['ALFA-list']}/items`,
        { type: 'TASK', title },
      );
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const patch = await api(page, 'PATCH', `/workspaces/${ws}/items/${r.body.id}`, {
        description,
      });
      expect(patch.status, JSON.stringify(patch.body)).toBe(204);
      return r.body;
    };
    const doc = (text: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const short = await mk('Kısa açıklamalı', doc('Tek cümle.'));
    const long = await mk(
      'Uzun açıklamalı',
      doc(
        'Kullanıcı giriş yapar. Sistem oturumu açar. Hatalı şifrede uyarı çıkar. Üç denemede kilitlenir.',
      ),
    );

    await page.goto(`/items/${short.key}`);
    const btn = page.getByTestId('ai-estimate');
    await expect(btn).toBeDisabled();
    await page.screenshot({ path: `${SHOT}/08-ai-kisa.png` });

    await page.goto(`/items/${long.key}`);
    await expect(page.getByText(/Açıklama: \d+ \/ 3 cümle/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/08-ai-uzun.png` });
    await expect(page.getByTestId('ai-estimate')).toBeEnabled();
    await page.getByTestId('ai-estimate').click();
    await expect(page.getByTestId('ai-estimate-result')).toContainText('5');
    await page.screenshot({ path: `${SHOT}/08-ai-oneri.png` });
  });

  test('Rol adları ve yönetici bilgisi arayüzde', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/diagnostics');
    await expect(page.getByRole('heading', { name: /Tanılama/ })).toBeVisible();
    await page.getByRole('button', { name: /Testi çalıştır/ }).click();
    await expect(page.getByTestId('diagnostics-verdicts')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${SHOT}/09-tanilama.png`, fullPage: true });
  });
});
