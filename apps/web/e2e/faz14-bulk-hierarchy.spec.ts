import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-126: kutucukla toplu Sub-Task yapma/çıkarma, anında tepki veren seçim, Epic adı varsayılanı. */
test.describe.serial('Backlog toplu hiyerarşi', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  const call = <T>(page: Page, method: string, path: string, body?: unknown) =>
    page.evaluate(
      async ({ method, path, body }) => {
        const csrf =
          document.cookie
            .split('; ')
            .find((c) => c.startsWith('sm_csrf='))
            ?.split('=')[1] ?? '';
        const res = await fetch('/api' + path, {
          method,
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return (res.status === 204 ? null : await res.json()) as T;
      },
      { method, path, body },
    );

  test('toplu Sub-Task yap, toplu çıkar; seçim anında yanıt verir; yeni Epic adı Task adıyla gelir', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Toplu Proje');
    await dialog.getByLabel('Anahtar').fill('TPL');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Toplu Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const space = tree.spaces.find((s) => s.key === 'TPL')!;
    const make = (title: string) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`, {
        type: 'TASK',
        title,
        parentId: null,
      });
    const names = ['Giriş', 'Kayıt', 'Profil', 'Ana iş'];
    for (const n of names) await make(n);
    // Çok satırlı bir liste: seçimin satır sayısından bağımsız hızlı olduğunu doğrular.
    for (let i = 0; i < 60; i += 1) await make(`Dolgu ${i}`);

    await page.goto(`/spaces/${space.id}/backlog`);
    const key = (n: number) => page.getByLabel(`TPL-${n} öğesini seç`);

    // Seçim anında yanıt verir.
    const ms = await key(1).evaluate(async (el: HTMLInputElement) => {
      const t0 = performance.now();
      el.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { checked: el.checked, ms: performance.now() - t0 };
    });
    expect(ms.checked).toBe(true);
    expect(ms.ms).toBeLessThan(250);
    await key(2).check();
    const bar = page.getByRole('region', { name: 'Seçili öğeler' });
    await expect(bar).toContainText('2 seçili');

    // Toplu Sub-Task yap: TPL-1 ve TPL-2 → TPL-4 altına.
    await bar.getByTestId('nest-selected').click();
    const nest = page.getByRole('dialog', { name: /2 öğe Sub-Task yapılsın/ });
    await nest.getByLabel('Üst Task').selectOption({ label: 'TPL-4 Ana iş' });
    await nest.getByRole('button', { name: 'Sub-Task yap' }).click();
    await expect(page.getByText('2 öğe TPL-4 altına alındı.')).toBeVisible();
    for (const n of [1, 2]) {
      const item = await call<{ type: string; parentId: string | null }>(
        page,
        'GET',
        `/workspaces/${ws}/items/key/TPL-${n}`,
      );
      expect(item.type).toBe('SUBTASK');
      expect(item.parentId).not.toBeNull();
    }

    // Üst Task açılır; alt öğeleri seçip toplu çıkar.
    await expect(page.locator('[data-subtask]')).toHaveCount(2);
    await key(1).check();
    await key(2).check();
    await expect(bar).toContainText('2 seçili');
    await bar.getByTestId('unnest-selected').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Çıkar' }).click();
    await expect(page.getByText('2 öğe üst öğesinden çıkarıldı.')).toBeVisible();
    for (const n of [1, 2]) {
      const item = await call<{ type: string; parentId: string | null }>(
        page,
        'GET',
        `/workspaces/${ws}/items/key/TPL-${n}`,
      );
      expect(item.type).toBe('TASK');
      expect(item.parentId).toBeNull();
    }

    // Gruplarken yeni Epic adı, seçilen ilk Task'ın adıyla gelir ve değiştirilebilir.
    await key(3).check();
    await bar.getByTestId('group-selected').click();
    const group = page.getByRole('dialog', { name: /1 öğeyi Epic altında grupla/ });
    await group.getByLabel('Epic', { exact: true }).selectOption({ label: '+ Yeni Epic oluştur…' });
    await expect(group.getByLabel('Yeni Epic’in adı')).toHaveValue('Profil');
    await group.getByRole('button', { name: 'İptal' }).click();
    await key(3).uncheck();

    // Tek Task ve alt görevi varsa iki yol sunulur: Epic altına al ya da Epic'e dönüştür.
    const parent = await make('Büyük iş');
    const sub = (title: string) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`, {
        type: 'SUBTASK',
        title,
        parentId: parent.id,
      });
    await sub('Adım 1');
    await sub('Adım 2');
    const big = await call<{ key: string }>(page, 'GET', `/workspaces/${ws}/items/${parent.id}`);
    await page.reload();
    await page.getByLabel(`${big.key} öğesini seç`).check();
    await bar.getByTestId('group-selected').click();
    const modes = page.getByRole('dialog', { name: /1 öğeyi Epic altında grupla/ });
    await expect(modes.getByRole('radiogroup')).toBeVisible();
    await expect(modes.getByTestId('group-preview')).toContainText('2 alt görev');
    await modes.getByRole('radio', { name: /Epic’e dönüştür/ }).check();
    await expect(modes).toContainText(`${big.key} Epic olacak. 2 alt görevi Task`);
    await expect(modes.getByLabel('Epic’in adı')).toHaveValue('Büyük iş');
    await modes.getByLabel('Epic’in adı').fill('Büyük proje');
    await modes.getByRole('button', { name: /Epic.e dönüştür/ }).click();
    await expect(page.getByText(`${big.key} artık bir Epic.`)).toBeVisible();
    const epic = await call<{ type: string; title: string }>(
      page,
      'GET',
      `/workspaces/${ws}/items/${parent.id}`,
    );
    expect(epic.type).toBe('EPIC');
    expect(epic.title).toBe('Büyük proje');
  });

  test('seçim çubuğu uzun listede de ekranda kalır; seçilenler toplu sprint’e taşınır', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Taşıma Proje');
    await dialog.getByLabel('Anahtar').fill('TSM');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Taşıma Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const space = tree.spaces.find((s) => s.key === 'TSM')!;
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const sprint = (name: string, from: number) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/spaces/${space.id}/sprints`, {
        name,
        goal: 'Hedef',
        startDate: day(from),
        endDate: day(from + 10),
      });
    const one = await sprint('Birinci', 0);
    await sprint('İkinci', 11);
    const ids: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const it = await call<{ id: string }>(
        page,
        'POST',
        `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`,
        { type: 'TASK', title: `Görev ${i}`, parentId: null },
      );
      ids.push(it.id);
    }
    await call(page, 'POST', `/workspaces/${ws}/spaces/${space.id}/backlog/move`, {
      itemIds: ids.slice(0, 2),
      sprintId: one.id,
    });

    await page.goto(`/spaces/${space.id}/backlog`);
    await page.getByLabel('TSM-1 öğesini seç').check();
    await page.getByLabel('TSM-2 öğesini seç').check();
    const bar = page.getByRole('region', { name: 'Seçili öğeler' });
    // Sayfa en alta kaydırılsa da çubuk görünür kalır.
    await page.mouse.wheel(0, 5000);
    await expect(bar).toBeInViewport();
    await bar.getByLabel("Sprint'e taşı…").selectOption({ label: 'İkinci' });
    await expect(page.getByText(/2 öğe İkinci sprint/)).toBeVisible();
  });

  test('hızlı liste en çok 3 sprint gösterir; "Farklı sprint…" penceresi Proje seçer, arar ve kaydırdıkça devam eder', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    const create = async (name: string, key: string) => {
      await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
      const d = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
      await d.getByLabel('Ad', { exact: true }).fill(name);
      await d.getByLabel('Anahtar').fill(key);
      await d.getByRole('button', { name: 'Proje oluştur' }).click();
      await expect(page.getByRole('heading', { name })).toBeVisible();
    };
    await create('Çok Sprint', 'CSP');
    await create('Varış Proje', 'VRS');

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const csp = tree.spaces.find((s) => s.key === 'CSP')!;
    const hdf = tree.spaces.find((s) => s.key === 'VRS')!;
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const sprint = (spaceId: string, name: string, from: number) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/spaces/${spaceId}/sprints`, {
        name,
        goal: 'Hedef',
        startDate: day(from),
        endDate: day(from + 10),
      });
    for (let n = 1; n <= 30; n += 1) await sprint(csp.id, `Koşu ${n}`, (n - 1) * 11);
    await sprint(hdf.id, 'Hedef Koşusu', 0);
    const item = (title: string) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/lists/${csp.lists[0]!.id}/items`, {
        type: 'TASK',
        title,
        parentId: null,
      });
    await item('Bir');
    const two = await item('İki');

    await page.goto(`/spaces/${csp.id}/backlog`);
    await page.getByLabel('CSP-1 öğesini seç').check();
    const bar = page.getByRole('region', { name: 'Seçili öğeler' });
    const quick = bar.getByLabel("Sprint'e taşı…");
    // Placeholder + Backlog + en çok 3 sprint + "Farklı sprint…".
    await expect(quick.locator('option')).toHaveCount(6);
    await quick.selectOption({ label: 'Farklı sprint…' });

    const dlg = page.getByRole('dialog', { name: /1 öğeyi taşı/ });
    await expect(dlg.getByLabel('Proje')).toHaveValue(csp.id);
    const list = dlg.getByTestId('sprint-list');
    // İlk sayfa: Backlog + 12 sprint; aşağı kaydırdıkça devam eder.
    await expect(list.getByRole('option')).toHaveCount(13);
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(list.getByRole('option')).toHaveCount(25);
    // Ada göre arama.
    await dlg.getByLabel('Sprint ara…').fill('Koşu 27');
    await expect(list.getByRole('option')).toHaveCount(1);
    await list.getByRole('option', { name: /Koşu 27/ }).click();
    await expect(dlg.getByTestId('move-summary')).toContainText('CSP-1');
    await expect(dlg.getByTestId('move-summary')).toContainText('Koşu 27');
    await dlg.getByRole('button', { name: 'Taşı', exact: true }).click();
    await expect(page.getByText(/1 öğe .*Koşu 27/)).toBeVisible();

    // Başka Proje: sprint listesi seçilen Proje'ninkidir.
    await page.getByLabel('CSP-2 öğesini seç').check();
    await quick.selectOption({ label: 'Farklı sprint…' });
    const dlg2 = page.getByRole('dialog', { name: /1 öğeyi taşı/ });
    await dlg2.getByLabel('Proje').selectOption({ label: 'Varış Proje' });
    await expect(dlg2.getByTestId('sprint-list').getByRole('option')).toHaveCount(2);
    await dlg2.getByRole('option', { name: /Hedef Koşusu/ }).click();
    await expect(dlg2.getByTestId('move-summary')).toContainText('Varış Proje');
    await dlg2.getByRole('button', { name: 'Taşı', exact: true }).click();
    await expect(page.getByText(/1 öğe taşındı: Varış Proje/)).toBeVisible();
    const moved = await call<{ spaceId: string; sprintId: string | null }>(
      page,
      'GET',
      `/workspaces/${ws}/items/${two.id}`,
    );
    expect(moved.spaceId).toBe(hdf.id);
    expect(moved.sprintId).not.toBeNull();
  });
});
