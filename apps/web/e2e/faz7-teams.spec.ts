import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 7.7: ekipler: oluştur, göreve ekiple toplu ata. */
test.describe.serial('Ekipler', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('ekip oluşturulur ve göreve tek tıkla atanır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const space = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await space.getByLabel('Ad', { exact: true }).fill('Ekip Testi');
    await space.getByLabel('Anahtar').fill('EKP');
    await space.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Ekip Testi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Sürüm notları');
    await quick.press('Enter');
    await expect(page.getByText('EKP-1 oluşturuldu.')).toBeVisible();

    // Ekip oluştur.
    await page.goto('/settings/teams');
    await page.getByRole('button', { name: 'Ekip ekle' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ekip ekle' });
    await dialog.getByLabel('Ekip adı').fill('Çekirdek ekip');
    await dialog.getByRole('checkbox', { name: new RegExp(OWNER.name) }).check();
    await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Ekip kaydedildi.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Çekirdek ekip' })).toBeVisible();

    // Göreve ekiple ata.
    await page.goto('/items/EKP-1');
    await page.getByRole('button', { name: 'Atananları değiştir' }).click();
    await page.getByRole('menuitem', { name: /Çekirdek ekip/ }).click();
    await expect(page.getByText(OWNER.name).first()).toBeVisible();
  });
});
