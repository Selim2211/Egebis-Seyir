import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 7.5: doküman araması, sayfa ekleri ve görev listesi. */
test.describe.serial('Doküman arama, ekler ve görev listesi', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('sayfa oluşturulur; görev listesi ve ek eklenir; global arama sayfayı bulur', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Wiki Testi');
    await dialog.getByLabel('Anahtar').fill('WKI');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Wiki Testi' })).toBeVisible();

    await sidebar.getByRole('link', { name: 'Dokümanlar' }).click();
    await page
      .getByRole('region', { name: 'Doküman sayfası' })
      .getByRole('button', { name: 'Yeni sayfa' })
      .click();
    await page.getByRole('textbox', { name: 'Sayfa başlığı' }).fill('Kurulum rehberi');

    // Görev listesi: araç çubuğundan açılır, madde yazılır ve işaretlenir.
    const body = page.getByRole('textbox', { name: 'Sayfa içeriği' });
    await body.click();
    await page.getByRole('button', { name: 'Görev listesi' }).click();
    const saved = page.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' && (res.request().postData() ?? '').includes('taskList'),
    );
    await page.keyboard.type('Sunucuyu hazırla');
    await saved;
    await expect(body.getByRole('checkbox')).toHaveCount(1);
    await body.getByRole('checkbox').check();
    await expect(page.getByText('Kaydedildi')).toBeVisible();

    // Ek yükleme.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sartname.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%test\n'),
    });
    await expect(page.getByRole('link', { name: 'sartname.pdf', exact: true })).toBeVisible();

    // Yenilemeden sonra kalıcı.
    await page.reload();
    await expect(page.getByRole('link', { name: 'sartname.pdf', exact: true })).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Sayfa içeriği' }).getByRole('checkbox', { checked: true }),
    ).toHaveCount(1);

    // Global arama sayfayı bulur ve açar.
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Ara' }).fill('Sunucuyu');
    await page.getByRole('option', { name: /Kurulum rehberi/ }).click();
    await expect(page.getByRole('textbox', { name: 'Sayfa başlığı' })).toHaveValue(
      'Kurulum rehberi',
    );
  });
});
