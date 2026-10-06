import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 7.4: formlar: yönetici tanımlar, doldurulunca hedef List'te görev açılır. */
test.describe.serial('Formlar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('form tanımlanır, doldurulur ve görev oluşur', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Form Testi');
    await dialog.getByLabel('Anahtar').fill('FRM');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Form Testi' })).toBeVisible();

    // Space ayarlarında form tanımla.
    await page.getByRole('link', { name: 'Ayarlar' }).last().click();
    await page.getByRole('button', { name: 'Form ekle' }).click();
    const editor = page.getByRole('dialog', { name: 'Form ekle' });
    await editor.getByLabel('Form adı').fill('Hata bildir');
    await editor.getByLabel('Açılacak tip').selectOption('BUG');
    await editor.getByRole('checkbox', { name: 'Açıklama' }).check();
    await editor.getByRole('checkbox', { name: 'Zorunlu' }).first().check();
    await editor.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Form kaydedildi.')).toBeVisible();

    // Formlar sayfasından doldur.
    await sidebar.getByRole('link', { name: 'Formlar' }).click();
    await page.getByRole('link', { name: /Hata bildir/ }).click();
    await page.getByLabel('Başlık').fill('Giriş ekranı açılmıyor');
    // Zorunlu açıklama boşken gönderilemez.
    await page.getByRole('button', { name: 'Gönder' }).click();
    await expect(page.getByText('Bu alan zorunlu.')).toBeVisible();
    await page.getByLabel('Açıklama').fill('Android 14 üzerinde siyah ekran.');
    await page.getByRole('button', { name: 'Gönder' }).click();
    await expect(page.getByText('FRM-1 oluşturuldu.')).toBeVisible();

    // Görev hedef List'te açıldı.
    await page.goto(page.url().replace(/\/forms.*/, ''));
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await expect(page.getByRole('link', { name: 'Giriş ekranı açılmıyor' })).toBeVisible();
  });
});
