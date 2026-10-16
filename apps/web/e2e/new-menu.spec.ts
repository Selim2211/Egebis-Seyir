import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Üst çubuktaki büyük "New" düğmesi: Task / Epic / Bug tek yerden oluşturulur. */
test.describe.serial('New menüsü', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Space açılır, New ile Epic ve Task oluşturulur', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const space = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await space.getByLabel('Ad', { exact: true }).fill('Yeni Menü');
    await space.getByLabel('Anahtar').fill('NMN');
    await space.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Yeni Menü' })).toBeVisible();

    const button = page.getByTestId('new-menu');
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);

    await button.click();
    await page.getByRole('menuitem', { name: /^Epic/ }).click();
    const dialog = page.getByRole('dialog', { name: 'New Epic' });
    await dialog.getByLabel('Başlık').fill('Büyük hedef');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('NMN-1 oluşturuldu.')).toBeVisible();
    await expect(page).toHaveURL(/\/items\/NMN-1/);

    // Kısayol: N (odak sayfada olsun).
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('n');
    await page.getByRole('menuitem', { name: /^Task/ }).click();
    await page.getByRole('dialog', { name: 'New Task' }).getByLabel('Başlık').fill('Küçük iş');
    await page
      .getByRole('dialog', { name: 'New Task' })
      .getByRole('button', { name: 'Create' })
      .click();
    await expect(page.getByText('NMN-2 oluşturuldu.')).toBeVisible();
  });
});
