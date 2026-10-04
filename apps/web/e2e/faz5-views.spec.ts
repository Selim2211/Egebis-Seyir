import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 5.1: kayıtlı görünümler: kaydet, uygula, paylaş, güncelle, sil. */
test.describe.serial('Kayıtlı görünümler', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('süzgeç kaydedilir ve başka bir durumdayken tek tıkla uygulanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Görünüm Testi');
    await dialog.getByLabel('Anahtar').fill('GRN');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Görünüm Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    for (const [index, title] of ['Rapor hazırla', 'Toplantı notu'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`GRN-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await page.getByRole('textbox', { name: 'Listede ara…' }).fill('rapor');
    await expect(page).toHaveURL(/q=rapor/);

    await page.getByRole('button', { name: 'Görünümler' }).click();
    await expect(page.getByText('Kayıtlı görünüm yok.')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Geçerli görünümü kaydet…' }).click();
    const save = page.getByRole('dialog', { name: 'Geçerli görünümü kaydet…' });
    await save.getByLabel('Görünüm adı').fill('Raporlar');
    await save.getByRole('checkbox', { name: /Ekiple paylaş/ }).check();
    await save.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('“Raporlar” görünümü kaydedildi.')).toBeVisible();
    // Kaydedilen görünüm geçerli durumla eşleştiği için etkin olarak görünür.
    await expect(page.getByRole('button', { name: /Raporlar/ })).toBeVisible();

    // Süzgeç temizlenir, görünüm menüden uygulanır.
    await page.getByRole('button', { name: 'Temizle', exact: true }).click();
    await expect(page).not.toHaveURL(/q=rapor/);
    await page.getByRole('button', { name: 'Görünümler' }).click();
    await page.getByRole('menuitem', { name: /^Raporlar/ }).click();
    await expect(page).toHaveURL(/q=rapor/);
    await expect(page.getByRole('textbox', { name: 'Listede ara…' })).toHaveValue('rapor');
  });

  test('görünüm silinir', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Görünüm Testi' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await page.getByRole('button', { name: 'Görünümler' }).click();
    await page.getByRole('menuitem', { name: /^Raporlar/ }).click();
    await page.getByRole('button', { name: /Raporlar/ }).click();
    await page.getByRole('menuitem', { name: '“Raporlar” görünümünü sil' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();

    await page.getByRole('button', { name: /Görünümler|Raporlar/ }).click();
    await expect(page.getByText('Kayıtlı görünüm yok.')).toBeVisible();
  });
});
