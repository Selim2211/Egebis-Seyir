import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 7.9: hedefler: sayısal hedef güncelleme ve görev bazlı hedefe görev bağlama. */
test.describe.serial('Hedefler', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('sayısal hedef oluşturulur ve güncel değer ilerlemeyi değiştirir', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Hedefler' }).click();
    await page.getByRole('button', { name: 'Hedef ekle' }).click();
    const dialog = page.getByRole('dialog', { name: 'Hedef ekle' });
    await dialog.getByLabel('Hedef adı').fill('Aylık satış');
    await dialog.getByLabel('Tür').selectOption('NUMBER');
    await dialog.getByLabel('Hedef', { exact: true }).fill('200');
    await dialog.getByLabel('Birim').fill('adet');
    await dialog.getByRole('button', { name: 'Hedefi oluştur' }).click();
    await expect(page.getByText('Hedef oluşturuldu.')).toBeVisible();

    const bar = page.getByRole('progressbar', { name: 'Aylık satış' });
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    const current = page.getByLabel('Aylık satış güncel değeri');
    await current.fill('50');
    await current.press('Enter');
    await expect(bar).toHaveAttribute('aria-valuenow', '25');
  });

  test('görev bazlı hedefe görev bağlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const space = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await space.getByLabel('Ad', { exact: true }).fill('Hedef Testi');
    await space.getByLabel('Anahtar').fill('HDF');
    await space.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Hedef Testi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Lansman duyurusu');
    await quick.press('Enter');
    await expect(page.getByText('HDF-1 oluşturuldu.')).toBeVisible();

    await sidebar.getByRole('link', { name: 'Hedefler' }).click();
    await page.getByRole('button', { name: 'Hedef ekle' }).click();
    const dialog = page.getByRole('dialog', { name: 'Hedef ekle' });
    await dialog.getByLabel('Hedef adı').fill('Lansman');
    await dialog.getByRole('button', { name: 'Hedefi oluştur' }).click();
    await expect(page.getByText('Hedef oluşturuldu.')).toBeVisible();

    await page.getByRole('button', { name: 'Lansman', exact: true }).click();
    await page.getByLabel('Lansman hedefine görev ekle').fill('Lansman duyurusu');
    await page.getByRole('button', { name: /HDF-1/ }).click();
    await expect(page.getByRole('link', { name: /Lansman duyurusu/ })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Lansman' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });
});
