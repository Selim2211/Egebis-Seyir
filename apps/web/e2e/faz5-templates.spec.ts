import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 5.5: şablonlar: iş şablonundan iş, Space şablonundan Space. */
test.describe.serial('Şablonlar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('iş şablon olarak kaydedilir, Şablondan ekle ile yeni iş gelir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Şablon Testi');
    await dialog.getByLabel('Anahtar').fill('SBL');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Şablon Testi' })).toBeVisible();
    const spaceId = /spaces\/([^/?]+)/.exec(page.url())![1]!;

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Sürüm kontrol listesi');
    await quick.press('Enter');
    await expect(page.getByText('SBL-1 oluşturuldu.')).toBeVisible();
    const listUrl = page.url().split('?')[0]!;

    await page.goto(`${listUrl}?item=SBL-1`);
    await page.getByRole('button', { name: 'Şablon olarak kaydet' }).click();
    const save = page.getByRole('dialog', { name: 'Şablon olarak kaydet' });
    await save.getByLabel('Şablon adı').fill('Sürüm şablonu');
    await save.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Şablon kaydedildi.')).toBeVisible();

    // Ayarlarda listelenir.
    await page.goto(`/spaces/${spaceId}/settings`);
    await expect(page.getByText('Sürüm şablonu')).toBeVisible();

    // List sayfasında şablondan iş eklenir.
    await page.goto(listUrl);
    await page.getByRole('button', { name: 'Şablondan ekle' }).click();
    await page.getByRole('menuitem', { name: 'Sürüm şablonu' }).click();
    await expect(page.getByText('“Sürüm şablonu” şablonundan iş oluşturuldu.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sürüm kontrol listesi' })).toHaveCount(2);
  });

  test('Space şablonundan yeni Space', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await page.getByRole('complementary').getByRole('link', { name: 'Şablon Testi' }).click();
    await page.getByRole('link', { name: 'Space ayarları' }).click();
    await page.getByRole('textbox', { name: 'Space şablonu adı' }).fill('Ekip şablonu');
    await page.getByRole('button', { name: 'Bu Space’i şablon yap' }).click();
    await expect(page.getByText('Şablon kaydedildi.')).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Şablondan başla').selectOption({ label: 'Ekip şablonu' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Şablonlu Space');
    await dialog.getByLabel('Anahtar').fill('SBS');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Şablonlu Space' })).toBeVisible();
  });
});
