import { expect, test } from '@playwright/test';

test.describe('Uygulama kabuğu', () => {
  test('ana sayfa Türkçe açılır ve API bağlıdır', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ana Sayfa' })).toBeVisible();
    await expect(page.locator('[role="status"][data-state="up"]')).toBeVisible();
  });

  test('dil İngilizceye geçer ve kalıcıdır', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dil' }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });

  test('koyu tema uygulanır', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Tema' }).click();
    await page.getByRole('menuitemradio', { name: 'Koyu' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('tasarım sistemi sayfası tüm iş öğesi tiplerini gösterir', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Tasarım sistemi', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tasarım sistemi' })).toBeVisible();
    for (const type of ['Epic', 'Story', 'Task', 'Sub-task', 'Bug']) {
      await expect(page.getByRole('img', { name: type }).first()).toBeVisible();
    }
  });

  test('bilinmeyen adres 404 sayfası gösterir', async ({ page }) => {
    await page.goto('/olmayan-sayfa');
    await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible();
  });
});
