import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-135: Backlog'da Bug yok; Epic'ler grup olarak üstte, Task'lar sürüklenerek Epic'e girer/çıkar. */
test.describe.serial('Backlog Epic hiyerarşisi', () => {
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

  test('Bug gizli, Epic grubu görünür, Task Epic’e sürüklenip çıkarılır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Epic Proje');
    await dialog.getByLabel('Anahtar').fill('EPX');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Epic Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const space = tree.spaces.find((s) => s.key === 'EPX')!;
    const item = (title: string, type: string, parentId: string | null) =>
      call<{ id: string; key: string }>(
        page,
        'POST',
        `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`,
        { type, title, parentId },
      );
    const epic = await item('Ödeme Epic', 'EPIC', null);
    await item('Epic içi iş', 'TASK', epic.id);
    const loose = await item('Serbest iş', 'TASK', null);
    await item('Gizli hata', 'BUG', null);

    await page.goto(`/spaces/${space.id}/backlog`);
    const group = page.getByTestId('epic-group');
    await expect(group).toContainText('Ödeme Epic');
    await expect(group).toContainText('Epic içi iş');
    await expect(page.getByText('Gizli hata')).toHaveCount(0);

    // Serbest Task, Epic satırına bırakılır -> onay -> Epic'in altına girer.
    const row = page.locator(`[data-row-id]`, { hasText: 'Serbest iş' }).first();
    await row.scrollIntoViewIfNeeded();
    const from = (await row.boundingBox())!;
    const epicRow = page.locator('[data-epic-id]').first();
    const to = (await epicRow.boundingBox())!;
    await page.mouse.move(from.x + from.width * 0.6, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 120, to.y + to.height / 2, { steps: 15 });
    await expect(page.getByTestId('dnd-intent')).toContainText('Epic');
    await page.mouse.up();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Epic altına al' }).click();
    await expect
      .poll(
        async () =>
          (
            await call<{ parentId: string | null }>(
              page,
              'GET',
              `/workspaces/${ws}/items/key/${loose.key}`,
            )
          ).parentId,
      )
      .toBe(epic.id);

    // Epic altındaki Task, Ayır alanına bırakılınca Epic'ten çıkar.
    await expect(group).toContainText('Serbest iş');
    const inside = page.locator('[data-row-id]', { hasText: 'Serbest iş' }).first();
    const box = (await inside.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + box.height / 2 + 40, { steps: 6 });
    const zone = (await page.getByTestId('detach-zone').boundingBox())!;
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Ayır' }).click();
    await expect
      .poll(
        async () =>
          (
            await call<{ parentId: string | null }>(
              page,
              'GET',
              `/workspaces/${ws}/items/key/${loose.key}`,
            )
          ).parentId,
      )
      .toBeNull();
  });
});
