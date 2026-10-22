import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-124: Task'ları Epic altında gruplama (farklı sprint'lerden seçerek) ve "Taşı…" ile Proje/Sprint değiştirme. */
test.describe.serial('Taşı ve grupla', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  /** Oturumlu API çağrısı (veri hazırlığı ve doğrulama için). */
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

  const create = async (page: Page, name: string, key: string) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill(name);
    await dialog.getByLabel('Anahtar').fill(key);
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  };

  test('hazırlık: iki Proje, sprint ve Task’lar', async ({ page }) => {
    await create(page, 'Birinci Proje', 'BRN');
    await create(page, 'Hedef Proje', 'HDF');
    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const brn = tree.spaces.find((s) => s.key === 'BRN')!;
    const hdf = tree.spaces.find((s) => s.key === 'HDF')!;
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const make = (spaceId: string, name: string, from: number) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/spaces/${spaceId}/sprints`, {
        name,
        goal: 'Hedef',
        startDate: day(from),
        endDate: day(from + 10),
      });
    const s1 = await make(brn.id, 'Sprint 1', 0);
    const s2 = await make(brn.id, 'Sprint 2', 11);
    await make(hdf.id, 'Hedef Sprint', 0);
    const item = (title: string, parentId: string | null = null, type = 'TASK') =>
      call<{ id: string; key: string }>(
        page,
        'POST',
        `/workspaces/${ws}/lists/${brn.lists[0]!.id}/items`,
        {
          type,
          title,
          parentId,
        },
      );
    const a = await item('Giriş');
    const b = await item('Kayıt');
    const c = await item('Profil');
    await item('Alt iş', c.id, 'SUBTASK');
    await item('Kendi epic’im', null, 'EPIC');
    await call(page, 'POST', `/workspaces/${ws}/spaces/${brn.id}/backlog/move`, {
      itemIds: [a.id],
      sprintId: s1.id,
    });
    await call(page, 'POST', `/workspaces/${ws}/spaces/${brn.id}/backlog/move`, {
      itemIds: [b.id],
      sprintId: s2.id,
    });
  });

  test('farklı sprint’lerden ve Backlog’tan seçilen Task’lar yeni bir Epic altında toplanır', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Birinci Proje' }).first().click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();

    // Sprint 1, Sprint 2 ve Backlog'tan birer Task seç.
    await page.getByLabel('BRN-1 öğesini seç').check();
    await page.getByLabel('BRN-2 öğesini seç').check();
    await page.getByLabel('BRN-3 öğesini seç').check();
    const bar = page.getByRole('region', { name: 'Seçili öğeler' });
    await expect(bar).toContainText('3 seçili');

    await bar.getByTestId('group-selected').click();
    const dialog = page.getByRole('dialog', { name: /3 öğeyi Epic altında grupla/ });
    await dialog.getByRole('option', { name: '+ Yeni Epic oluştur…' }).click();
    await dialog.getByLabel('Yeni Epic’in adı').fill('Hesap yönetimi');
    // Sub-Task'lı Task (BRN-3) alt öğesiyle birlikte gitsin.
    await dialog.getByTestId('with-subtasks').click();
    await dialog.getByRole('button', { name: 'Grupla' }).click();
    await expect(page.getByText('3 öğe Epic altında toplandı.')).toBeVisible();
    await expect(bar).toHaveCount(0);

    // Üçü de aynı Epic'in altında; Sub-Task'ı olan Task alt öğesiyle birlikte.
    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const detail = async (key: string) =>
      call<{ parentId: string | null; sprintId: string | null; type: string }>(
        page,
        'GET',
        `/workspaces/${ws}/items/key/${key}`,
      );
    const [one, two, three] = [await detail('BRN-1'), await detail('BRN-2'), await detail('BRN-3')];
    expect(one.parentId).not.toBeNull();
    expect(two.parentId).toBe(one.parentId);
    expect(three.parentId).toBe(one.parentId);
    expect(one.sprintId).not.toBeNull();
    expect(two.sprintId).not.toBeNull();
    expect(one.sprintId).not.toBe(two.sprintId);
    expect((await detail('BRN-4')).parentId).toBe(
      (await call<{ id: string }>(page, 'GET', `/workspaces/${ws}/items/key/BRN-3`)).id,
    );
  });

  test('Task detayındaki Taşı… ile başka Proje’ye ve sprint’e taşınır', async ({ page }) => {
    await page.goto('/items/BRN-1');
    await page.getByTestId('move-item').click();
    const dialog = page.getByRole('dialog', { name: /BRN-1 taşınsın/ });
    // Varsayılan hedef kendi Proje'dir.
    await expect(dialog.getByLabel('Proje')).toHaveValue(/.+/);
    await expect(dialog.getByLabel('Proje').locator('option:checked')).toHaveText('Birinci Proje');
    await dialog.getByLabel('Proje').selectOption({ label: 'Hedef Proje' });
    await dialog.getByLabel('Sprint', { exact: true }).selectOption({ label: 'Hedef Sprint' });
    await dialog.getByRole('button', { name: 'Taşı', exact: true }).click();
    await expect(page.getByText('BRN-1, “Hedef Proje” projesine taşındı.')).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const moved = await call<{ sprintId: string | null; spaceId: string }>(
      page,
      'GET',
      `/workspaces/${ws}/items/key/BRN-1`,
    );
    const tree = await call<{ spaces: Array<{ key: string; id: string }> }>(
      page,
      'GET',
      `/workspaces/${ws}/hierarchy`,
    );
    expect(moved.spaceId).toBe(tree.spaces.find((s) => s.key === 'HDF')!.id);
    expect(moved.sprintId).not.toBeNull();
  });

  test('Epic taşınınca altındaki Task’lar birlikte gelir; Sub-Task’ta Taşı düğmesi yoktur', async ({
    page,
  }) => {
    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const epicKey = await call<{ parentId: string }>(
      page,
      'GET',
      `/workspaces/${ws}/items/key/BRN-2`,
    );
    const epic = await call<{ key: string }>(
      page,
      'GET',
      `/workspaces/${ws}/items/${epicKey.parentId}`,
    );

    await page.goto(`/items/${epic.key}`);
    await page.getByTestId('move-item').click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`${epic.key} taşınsın`) });
    await expect(dialog).toContainText('altındaki Task’lar');
    await dialog.getByLabel('Proje').selectOption({ label: 'Hedef Proje' });
    await dialog.getByRole('button', { name: 'Taşı', exact: true }).click();
    await expect(page.getByText(/“Hedef Proje” projesine taşındı/)).toBeVisible();

    const child = await call<{ spaceId: string }>(page, 'GET', `/workspaces/${ws}/items/key/BRN-2`);
    const hdf = (
      await call<{ spaces: Array<{ key: string; id: string }> }>(
        page,
        'GET',
        `/workspaces/${ws}/hierarchy`,
      )
    ).spaces.find((s) => s.key === 'HDF')!;
    expect(child.spaceId).toBe(hdf.id);

    await page.goto('/items/BRN-4');
    await expect(page.getByRole('textbox', { name: 'Başlık' }).first()).toHaveValue('Alt iş');
    await expect(page.getByTestId('move-item')).toHaveCount(0);
  });
});
