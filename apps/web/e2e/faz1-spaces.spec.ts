import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 1.2 akışı: Space oluştur → Folder/List → favori → arşiv/çöp → geri getir (taslak 1, 7). */
test.describe.serial('Space / Folder / List', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Space oluşturulur; anahtar addan önerilir, varsayılan liste ve durumlar gelir', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Mobil Uygulama');
    await expect(dialog.getByLabel('Anahtar')).toHaveValue('MOB');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();

    await expect(page.getByText('Mobil Uygulama oluşturuldu.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mobil Uygulama' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Görevler' }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Space ayarları' }).click();
    for (const status of ['Backlog', 'Yapılacak', 'Devam ediyor', 'İncelemede', 'Tamamlandı']) {
      await expect(page.getByText(status, { exact: true })).toBeVisible();
    }
  });

  test('Folder ve liste oluşturulur, liste yeniden adlandırılır ve favorilere eklenir', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Mobil Uygulama' }).click();

    await page.getByRole('button', { name: 'Folder oluştur', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Ad').fill('Sürüm 2.0');
    await page.getByRole('dialog').getByRole('button', { name: 'Oluştur' }).click();
    await expect(sidebar.getByRole('link', { name: 'Sürüm 2.0' })).toBeVisible();

    await page.getByRole('button', { name: 'Liste oluştur', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ad').fill('Hatalar');
    await dialog.getByLabel('Konum').selectOption({ label: 'Mobil Uygulama › Sürüm 2.0' });
    await dialog.getByRole('button', { name: 'Oluştur' }).click();
    await expect(page).toHaveURL(/\/lists\//);
    await expect(page.getByRole('heading', { name: 'Hatalar' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Konum' })).toContainText('Sürüm 2.0');

    await sidebar.getByRole('button', { name: 'Hatalar için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Yeniden adlandır' }).click();
    await page.getByRole('dialog').getByLabel('Ad').fill('Hata Kayıtları');
    await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByRole('heading', { name: 'Hata Kayıtları' })).toBeVisible();

    await page.getByRole('button', { name: 'Favorilere ekle' }).click();
    await expect(sidebar.getByText('Favoriler')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Favorilerden çıkar' })).toBeVisible();
  });

  test('liste arşivlenir, geri alınır; silinen liste çöp kutusundan geri getirilir', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Mobil Uygulama' }).click();

    // Arşivle → bildirimdeki "Geri al".
    await sidebar.getByRole('button', { name: 'Görevler için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Arşivle' }).click();
    await expect(page.getByText('Görevler arşivlendi.')).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Görevler' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Geri al' }).click();
    await expect(sidebar.getByRole('link', { name: 'Görevler' })).toBeVisible();

    // Sil → onay → Ayarlar › Arşiv ve çöp kutusu → Geri getir.
    await sidebar.getByRole('button', { name: 'Görevler için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Sil' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
    await expect(sidebar.getByRole('link', { name: 'Görevler' })).toHaveCount(0);

    await page.goto('/settings/archive');
    await page.getByRole('tab', { name: /Çöp kutusu/ }).click();
    await expect(page.getByText('30 gün sonra kalıcı olarak silinir')).toBeVisible();
    await page.getByRole('button', { name: 'Geri getir' }).click();
    await expect(page.getByText('Geri getirildi.')).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Görevler' })).toBeVisible();
  });
});
