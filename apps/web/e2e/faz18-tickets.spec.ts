import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-138: Bug → Task çevirme (Bug kalır, ibare taşır), Task'ta kaynak Bug, Bugs listesinde işaretler. */
test.describe.serial('Çağrı sistemi: Bug → Task', () => {
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

  test('Bug Task’a çevrilir; Bug listede ibareyle kalır, Task kaynağını gösterir', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Çağrı Proje');
    await dialog.getByLabel('Anahtar').fill('TKT');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Çağrı Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{ spaces: Array<{ key: string; id: string }> }>(
      page,
      'GET',
      `/workspaces/${ws}/hierarchy`,
    );
    const space = tree.spaces.find((s) => s.key === 'TKT')!;
    const bug = await call<{ key: string }>(
      page,
      'POST',
      `/workspaces/${ws}/spaces/${space.id}/bugs`,
      {
        title: 'Ödeme sayfası açılmıyor',
        severity: 'CRITICAL',
      },
    );

    await page.goto(`/items/${bug.key}`);
    await page.getByRole('button', { name: `${bug.key} için işlemler` }).click();
    await page.getByTestId('convert-bug').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Task’a çevir' }).click();

    // Yeni Task açılır: kaynak Bug kartı ve geçmiş kaydı görünür.
    await expect(page).toHaveURL(/\/items\/TKT-2$/);
    await expect(page.getByTestId('source-bug')).toContainText(bug.key);
    await expect(page.getByTestId('source-bug')).toContainText('Ödeme sayfası açılmıyor');
    await page.getByRole('tab', { name: /Aktivite/ }).click();
    await expect(page.getByText(`${bug.key} numaralı Bug’dan Task oluşturdu.`)).toBeVisible();

    // Bug silinmedi: sayfasında "Task'a çevrildi" ibaresi ve Task bağlantısı var.
    await page
      .getByTestId('source-bug')
      .getByRole('link', { name: new RegExp(bug.key) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/items/${bug.key}$`));
    const banner = page.getByTestId('converted-banner');
    await expect(banner).toContainText('Bu Bug Task’a çevrildi');
    await expect(banner).toContainText('TKT-2');
    // Çevrilmiş Bug için menüde seçenek hâlâ var (ikinci Task açılabilir); ama ibare kaybolmaz.

    // Bugs listesi: Bug yerinde, rozetle; taşıma düğmesi var.
    await page.goto(`/spaces/${space.id}/bugs`);
    const row = page.getByRole('row', { name: /Ödeme sayfası açılmıyor/ });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('bug-converted')).toContainText('TKT-2');
    await expect(row.getByTestId('bug-move')).toBeVisible();
  });
});
