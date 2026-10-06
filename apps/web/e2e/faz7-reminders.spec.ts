import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 7.3: görev hatırlatıcısı kurma ve silme. */
test.describe.serial('Hatırlatıcılar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('hatırlatıcı kurulur, listelenir ve silinir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Hatırlatma Testi');
    await dialog.getByLabel('Anahtar').fill('HTR');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Hatırlatma Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Raporu gönder');
    await quick.press('Enter');
    await expect(page.getByText('HTR-1 oluşturuldu.')).toBeVisible();

    await page.getByRole('link', { name: 'Raporu gönder' }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('button', { name: 'Hatırlat' })).toBeDisabled();

    const tomorrow = new Date(Date.now() + 24 * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T09:30`;
    await panel.getByLabel('Hatırlatma zamanı').fill(local);
    await panel.getByLabel('Hatırlatma notu').fill('Müşteriye de ilet');
    await panel.getByRole('button', { name: 'Hatırlat' }).click();
    await expect(panel.getByText(/Müşteriye de ilet/)).toBeVisible();

    // Yenilemeden sonra kalıcı.
    await page.reload();
    await expect(page.getByRole('dialog').getByText(/Müşteriye de ilet/)).toBeVisible();

    await page
      .getByRole('dialog')
      .getByRole('button', { name: /hatırlatıcısını sil/ })
      .click();
    await expect(page.getByRole('dialog').getByText(/Müşteriye de ilet/)).toHaveCount(0);
  });
});
