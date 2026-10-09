import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 8.3: denetim günlüğü sayfası — kim, ne zaman, ne yaptı; süzgeç ve CSV. */
test.describe('Denetim günlüğü', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('Sahip günlüğü görür, türe göre süzer ve CSV indirir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    // Günlükte görünecek bir eylem: yeni Space.
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Denetim Denemesi');
    await dialog.getByLabel('Anahtar').fill('AUD');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Denetim Denemesi' })).toBeVisible();

    await page.goto('/settings/audit');
    await expect(page.getByRole('heading', { name: 'Denetim günlüğü' })).toBeVisible();
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'Ne zaman' })).toBeVisible();
    const row = table.getByRole('row').filter({ hasText: 'Denetim Denemesi' }).first();
    await expect(row).toContainText('Zeynep Kaya');
    await expect(row).toContainText('Space oluşturdu.');

    await page.getByLabel('Tür').selectOption('sprint');
    await expect(table.getByRole('row').filter({ hasText: 'Denetim Denemesi' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Temizle' }).click();
    await expect(row).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV indir' }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^denetim-gunlugu-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});
