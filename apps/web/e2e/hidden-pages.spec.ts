import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-160: Raporlar, Formlar, Panel ve Gantt menüden kalktı; eski adresler Proje sayfasına döner. */
test.describe.serial('Gizlenen sayfalar', () => {
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
        const text = await res.text();
        return (text ? JSON.parse(text) : null) as T;
      },
      { method, path, body },
    );

  test('menüde ve sekmelerde yok; eski adresler Proje sayfasına yönlenir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const space = await call<{ id: string }>(page, 'POST', `/workspaces/${ws}/spaces`, {
      name: 'Gizli Sayfalar',
      key: 'GZS',
      color: '#7C3AED',
    });

    await page.goto(`/spaces/${space.id}/backlog`);
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Gizli Sayfalar' }).click();
    await expect(sidebar.getByRole('link', { name: 'Zaman çizelgesi' })).toBeVisible();
    for (const name of ['Panel', 'Gantt', 'Formlar']) {
      await expect(sidebar.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
    await expect(
      page.getByRole('navigation', { name: 'Scrum' }).getByRole('link', { name: 'Raporlar' }),
    ).toHaveCount(0);

    for (const path of ['reports', 'forms', 'dashboard', 'gantt']) {
      await page.goto(`/spaces/${space.id}/${path}`);
      await expect(page).toHaveURL(new RegExp(`/spaces/${space.id}$`));
    }
  });
});
