import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-113: öğe "Share" penceresi; gizli yapılır, kalıcıdır ve mirasa döndürülebilir. */
test.describe.serial('Öğe paylaşımı', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Epic gizlenir, sayfa yenilenince Private kalır, sıfırlanınca Share olur', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const space = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await space.getByLabel('Ad', { exact: true }).fill('Paylaşım');
    await space.getByLabel('Anahtar').fill('PAY');
    await space.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Paylaşım' })).toBeVisible();

    await page.getByTestId('new-menu').click();
    await page.getByRole('menuitem', { name: /^Epic/ }).click();
    const dialog = page.getByRole('dialog', { name: 'New Epic' });
    await dialog.getByLabel('Başlık').fill('Gizli plan');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/items\/PAY-1/);

    const share = page.getByTestId('share-button');
    await expect(share).toHaveText(/Share/);
    await share.click();
    const sharing = page.getByRole('dialog', { name: /Sharing & permissions/ });
    await expect(sharing.getByText(/Proje erişimini izler/)).toBeVisible();
    await sharing.getByRole('switch', { name: 'Gizli' }).click();
    await sharing.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Paylaşım ayarları kaydedildi.')).toBeVisible();
    await expect(page.getByTestId('share-button')).toHaveText(/Private/);

    await page.reload();
    await expect(page.getByTestId('share-button')).toHaveText(/Private/);

    await page.getByTestId('share-button').click();
    await page
      .getByRole('dialog', { name: /Sharing & permissions/ })
      .getByRole('button', { name: 'Mirasa döndür' })
      .click();
    await expect(page.getByTestId('share-button')).toHaveText(/Share/);
  });
});
