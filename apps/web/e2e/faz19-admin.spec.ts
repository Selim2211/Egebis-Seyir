import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-139: yönetici paneli — Bug akışı, proje/sprint durumu, geciken iş, ekip yükü. */
test.describe.serial('Yönetici paneli', () => {
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

  test('Owner paneli görür: KPI’lar, grafikler ve proje kartları gerçek veriyle dolar', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Panel Proje');
    await dialog.getByLabel('Anahtar').fill('PNL');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Panel Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }>; user: { id: string } }>(
      page,
      'GET',
      '/auth/me',
    );
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const space = tree.spaces.find((s) => s.key === 'PNL')!;
    const detail = await call<{ statuses: Array<{ id: string; category: string }> }>(
      page,
      'GET',
      `/workspaces/${ws}/spaces/${space.id}`,
    );
    const done = detail.statuses.find((s) => s.category === 'DONE')!;
    const item = (body: Record<string, unknown>) =>
      call<{ id: string }>(
        page,
        'POST',
        `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`,
        body,
      );
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await item({ type: 'BUG', title: 'Açık hata', severity: 'CRITICAL' });
    const fixed = await item({ type: 'BUG', title: 'Çözülen hata', severity: 'MINOR' });
    await call(page, 'PATCH', `/workspaces/${ws}/items/${fixed.id}`, { statusId: done.id });
    const overdue = await item({
      type: 'TASK',
      title: 'Geciken iş',
      dueDate: yesterday,
      assigneeIds: [me.user.id],
    });
    const task2 = await item({ type: 'TASK', title: 'Diğer iş' });
    const sprint = await call<{ id: string }>(
      page,
      'POST',
      `/workspaces/${ws}/spaces/${space.id}/sprints`,
      {
        name: 'Sprint Panel',
        goal: 'Hedef',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
      },
    );
    await call(page, 'POST', `/workspaces/${ws}/spaces/${space.id}/backlog/move`, {
      itemIds: [overdue.id, task2.id],
      sprintId: sprint.id,
    });
    await call(page, 'POST', `/workspaces/${ws}/sprints/${sprint.id}/start`, {});

    // Kenar çubuğundan açılır.
    await page.getByRole('link', { name: 'Yönetici paneli' }).click();
    await expect(page.getByTestId('admin-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yönetici paneli' })).toBeVisible();

    // Diğer testlerin bıraktığı veri sayıları değiştirebilir: ekrandaki değerler API ile aynı olmalı.
    const overview = await call<{
      bugs: { newToday: number; open: number; resolutionRate: number };
      totals: { overdueItems: number };
    }>(page, 'GET', `/workspaces/${ws}/admin/overview`);
    expect(overview.bugs.newToday).toBeGreaterThanOrEqual(2);
    expect(overview.totals.overdueItems).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('kpi-new-today')).toContainText(String(overview.bugs.newToday));
    await expect(page.getByTestId('kpi-open')).toContainText(String(overview.bugs.open));
    await expect(page.getByTestId('kpi-rate')).toContainText(`%${overview.bugs.resolutionRate}`);
    await expect(page.getByTestId('kpi-overdue')).toContainText(
      String(overview.totals.overdueItems),
    );
    await expect(page.getByTestId('chart-bug-flow')).toBeVisible();

    const card = page.getByTestId('admin-project').filter({ hasText: 'Panel Proje' });
    await expect(card).toContainText('Sprint Panel');
    await expect(card).toContainText('1 geciken');
    await expect(card).toContainText('1 açık Bug');
    await expect(card.getByRole('progressbar')).toBeVisible();

    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'test-results/admin-panel.png', fullPage: true });

    // Kartı tıklayınca projenin Backlog'u açılır.
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/spaces/${space.id}/backlog`));
  });
});
