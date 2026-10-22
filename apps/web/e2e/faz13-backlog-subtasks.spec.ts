import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-125: Scrum'da "Görevler" listesi yok; alt öğeler Backlog'da açılır ve sürüklenerek ayrılır. */
test.describe.serial('Backlog alt öğeleri', () => {
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

  test('alt öğe açılır, sürüklenip sprint’e bırakılınca Task olur; kenar çubuğunda Görevler yok', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Alt Proje');
    await dialog.getByLabel('Anahtar').fill('ALT');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Alt Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const space = tree.spaces.find((s) => s.key === 'ALT')!;
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    await call(page, 'POST', `/workspaces/${ws}/spaces/${space.id}/sprints`, {
      name: 'Sprint X',
      goal: 'Hedef',
      startDate: day(20),
      endDate: day(30),
    });
    const item = (title: string, type: string, parentId: string | null) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`, {
        type,
        title,
        parentId,
      });
    const parent = await item('Ana iş', 'TASK', null);
    await item('Küçük adım', 'SUBTASK', parent.id);

    await page.reload();
    await expect(sidebar.getByRole('link', { name: 'Görevler' })).toHaveCount(0);
    await page.goto(`/spaces/${space.id}/backlog`);

    // Satır sürüklenebilir olsa da düğmeye basıp fare biraz kayarak bırakılınca tıklama kaybolmaz (ADR-133).
    const toggle = page.getByRole('button', { name: 'Alt öğeleri göster' });
    await toggle.scrollIntoViewIfNeeded();
    const tb = (await toggle.boundingBox())!;
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2 + 8, tb.y + tb.height / 2 + 2, { steps: 3 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Alt öğeleri gizle' })).toBeVisible();
    const sub = page.locator('[data-subtask]').first();
    await expect(sub).toContainText('Küçük adım');

    const box = (await sub.boundingBox())!;
    const target = page.locator('[data-drop-container]').first();
    const to = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 80, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Ayır' }).click();
    await expect(page.getByText('ALT-2 artık bağımsız bir Task.')).toBeVisible();

    const detail = await call<{ parentId: string | null; type: string }>(
      page,
      'GET',
      `/workspaces/${ws}/items/key/ALT-2`,
    );
    expect(detail.parentId).toBeNull();
    expect(detail.type).toBe('TASK');
  });
});
