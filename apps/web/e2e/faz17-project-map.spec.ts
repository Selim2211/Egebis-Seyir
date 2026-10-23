import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-136: Proje Kuş Bakışı — Epic → Task → Sub-Task haritası, kayıtlı yerleşim, arama. */
test.describe.serial('Proje Kuş Bakışı', () => {
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

  test('kutular görünür, sürüklenen kutunun yeri kalır, arama diğerlerini soluklaştırır', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Harita Proje');
    await dialog.getByLabel('Anahtar').fill('HRT');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Harita Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const space = tree.spaces.find((s) => s.key === 'HRT')!;
    const item = (title: string, type: string, parentId: string | null) =>
      call<{ id: string }>(page, 'POST', `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`, {
        type,
        title,
        parentId,
        color: type === 'EPIC' ? '#7C3AED' : undefined,
      });
    const epic = await item('Ödeme altyapısı', 'EPIC', null);
    const task = await item('Kart ekleme', 'TASK', epic.id);
    await item('Kart doğrulama API', 'SUBTASK', task.id);
    await item('Ödeme düşüyor', 'BUG', null);

    await page.goto(`/spaces/${space.id}/map`);
    const nodes = page.getByTestId('map-node');
    await expect(nodes).toHaveCount(4);
    await expect(page.getByRole('link', { name: 'Proje Kuş Bakışı' })).toBeVisible();
    await expect(page.locator('.react-flow__edge')).toHaveCount(2);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/project-map.png' });

    // Bağlantı noktasına tıklamak haritada bırakır (iş sayfasına atmaz, çökmez).
    const url = page.url();
    await page.locator('.react-flow__handle.source').first().click({ force: true });
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
    await expect(nodes).toHaveCount(4);

    // Arama: eşleşmeyen kutular soluklaşır.
    await page.getByLabel('Ara (başlık ya da anahtar)').fill('Ödeme düşüyor');
    await expect(nodes.filter({ hasText: 'Ödeme düşüyor' })).not.toHaveClass(/opacity-20/);
    await expect(nodes.filter({ hasText: 'Kart ekleme' })).toHaveClass(/opacity-20/);
    await page.getByLabel('Ara (başlık ya da anahtar)').fill('');

    // Kutuyu sürükle: yer kaydedilir, sayfa yenilenince aynı yerde durur.
    const target = nodes.filter({ hasText: 'Ödeme düşüyor' });
    const before = (await target.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + 100, before.y + 80, { steps: 6 });
    // Sürüklerken hiçbir kutu kaybolmaz (ölçüm kaybı kutuları gizliyordu).
    for (const node of await nodes.all()) {
      await expect(node).toBeVisible();
      expect(
        await node.evaluate((el) => getComputedStyle(el.closest('.react-flow__node')!).visibility),
      ).toBe('visible');
    }
    await page.mouse.move(before.x + 200, before.y + 160, { steps: 6 });
    await page.mouse.up();
    const moved = (await target.boundingBox())!;
    expect(Math.abs(moved.x - before.x)).toBeGreaterThan(40);
    await expect
      .poll(
        async () =>
          Object.keys(
            (
              await call<{ positions: Record<string, unknown> }>(
                page,
                'GET',
                `/workspaces/${ws}/spaces/${space.id}/map`,
              )
            ).positions,
          ).length,
      )
      .toBeGreaterThan(0);

    await page.reload();
    const after = (await page
      .getByTestId('map-node')
      .filter({ hasText: 'Ödeme düşüyor' })
      .boundingBox())!;
    const others = (await page
      .getByTestId('map-node')
      .filter({ hasText: 'Kart ekleme' })
      .boundingBox())!;
    // Kaydedilen yerleşim korunur: Bug artık otomatik düzendeki kök sütununda değil.
    expect(after.x).toBeGreaterThan(others.x - 400);
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(0);

    // Otomatik düzen kaydı siler.
    await page.getByRole('button', { name: 'Otomatik düzen' }).click();
    await expect
      .poll(
        async () =>
          Object.keys(
            (
              await call<{ positions: Record<string, unknown> }>(
                page,
                'GET',
                `/workspaces/${ws}/spaces/${space.id}/map`,
              )
            ).positions,
          ).length,
      )
      .toBe(0);

    // Dikey düzen: Epic üstte, Task altında (yatayda Epic solda).
    await page.getByRole('button', { name: 'Dikey' }).click();
    await expect(page.getByRole('button', { name: 'Dikey' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(async () => {
        const epicBox = await nodes.filter({ hasText: 'Ödeme altyapısı' }).boundingBox();
        const taskBox = await nodes.filter({ hasText: 'Kart ekleme' }).boundingBox();
        return (
          !!epicBox &&
          !!taskBox &&
          epicBox.y < taskBox.y - 40 &&
          Math.abs(epicBox.x - taskBox.x) < 300
        );
      })
      .toBe(true);
    await page.getByRole('button', { name: 'Yatay' }).click();
  });
});
