import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 4.3: görevde süre girişi, sayaç ve zaman çizelgesi. */
test.describe.serial('Zaman takibi', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('elle süre girilir; geçersiz süre uyarı verir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Zaman Testi');
    await dialog.getByLabel('Anahtar').fill('ZMN');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Zaman Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await page.getByLabel('Tip').first().selectOption('TASK');
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Rapor yaz');
    await quick.press('Enter');
    await expect(page.getByText('ZMN-1 oluşturuldu.')).toBeVisible();

    await page.goto('/items/ZMN-1');
    const section = page.getByRole('region', { name: 'Zaman' });
    await section.getByRole('textbox', { name: 'Süre' }).fill('abc');
    await section.getByRole('button', { name: 'Süre ekle' }).click();
    await expect(section.getByRole('alert')).toContainText('Geçerli bir süre gir');

    await section.getByRole('textbox', { name: 'Süre' }).fill('1h 30m');
    await section.getByRole('textbox', { name: 'Not' }).fill('Taslak');
    await section.getByRole('button', { name: 'Süre ekle' }).click();
    await expect(section.getByText('Harcanan: 1s 30dk')).toBeVisible();
    await expect(section.getByText('Taslak')).toBeVisible();
  });

  test('sayaç üst çubukta çalışır ve durunca süre kaydedilir', async ({ page }) => {
    await page.goto('/items/ZMN-1');
    const section = page.getByRole('region', { name: 'Zaman' });
    await section.getByRole('button', { name: 'Sayacı başlat' }).click();

    const timer = page.getByRole('group', { name: 'Çalışan sayaç' });
    await expect(timer).toContainText('ZMN-1');
    await expect(timer).toContainText(/0:00:0\d/);

    await timer.getByRole('button', { name: 'Sayacı durdur' }).click();
    await expect(page.getByText('1 dk kaydedildi.')).toBeVisible();
    await expect(timer).toHaveCount(0);
    await expect(section.getByText('sayaçtan')).toBeVisible();
    await expect(section.getByText('Harcanan: 1s 31dk')).toBeVisible();
  });

  test('zaman çizelgesi sprint bazında Story Point gösterir (ADR-164)', async ({ page }) => {
    const api = <T>(method: string, path: string, body?: unknown) =>
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
    const me = await api<{ user: { id: string }; workspaces: Array<{ id: string }> }>(
      'GET',
      '/auth/me',
    );
    const ws = me.workspaces[0]!.id;
    const tree = await api<{ spaces: Array<{ id: string; key: string }> }>(
      'GET',
      `/workspaces/${ws}/hierarchy`,
    );
    const space = tree.spaces.find((s) => s.key === 'ZMN')!;
    await api('PATCH', `/workspaces/${ws}/spaces/${space.id}`, { scrumEnabled: true });
    const item = await api<{ id: string; statusId: string }>(
      'GET',
      `/workspaces/${ws}/items/key/ZMN-1`,
    );
    const sprint = await api<{ id: string }>(
      'POST',
      `/workspaces/${ws}/spaces/${space.id}/sprints`,
      {
        name: 'Efor S1',
        startDate: '2026-11-02',
        endDate: '2026-11-13',
      },
    );
    await api('POST', `/workspaces/${ws}/spaces/${space.id}/backlog/move`, {
      itemIds: [item.id],
      sprintId: sprint.id,
    });
    await api('PATCH', `/workspaces/${ws}/items/${item.id}`, {
      points: 5,
      assigneeIds: [me.user.id],
    });

    await page.getByRole('complementary').getByRole('link', { name: 'Zaman Testi' }).click();
    await page.getByRole('complementary').getByRole('link', { name: 'Zaman çizelgesi' }).click();
    await expect(page.getByRole('heading', { name: 'Zaman çizelgesi' })).toBeVisible();
    await expect(page.getByTestId('sprint-picker')).toHaveText('Efor S1');
    const table = page.getByRole('table', { name: 'Zaman çizelgesi' });
    await expect(table.getByRole('row', { name: /Zeynep/ })).toContainText('5');
    await expect(page.getByRole('region', { name: 'En büyük işler' })).toContainText('ZMN-1');
  });
});
