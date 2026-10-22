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
  });
});
