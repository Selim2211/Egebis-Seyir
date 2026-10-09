import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

// 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Faz 8.6: dokümanda görsel, geri al/yinele, Word'e aktarma. */
test.describe.serial('Doküman görsel, geri al/yinele ve Word', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  const body = (page: Page) => page.getByRole('textbox', { name: 'Sayfa içeriği' });

  test('sayfa hazırlanır; yazı geri alınır ve yinelenir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Doküman Görsel');
    await dialog.getByLabel('Anahtar').fill('DGR');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Doküman Görsel' })).toBeVisible();
    await sidebar.getByRole('link', { name: 'Dokümanlar' }).click();
    await page
      .getByRole('region', { name: 'Doküman sayfası' })
      .getByRole('button', { name: 'Yeni sayfa' })
      .click();
    await page.getByRole('textbox', { name: 'Sayfa başlığı' }).fill('Mimari notları');

    await body(page).click();
    await page.keyboard.type('Birinci cümle.');
    await expect(body(page)).toContainText('Birinci cümle.');
    await page.getByRole('button', { name: 'Geri al' }).click();
    await expect(body(page)).not.toContainText('Birinci cümle.');
    await page.getByRole('button', { name: 'Yinele' }).click();
    await expect(body(page)).toContainText('Birinci cümle.');
    // Klavye kısayolları da çalışır.
    await body(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(body(page)).not.toContainText('Birinci cümle.');
    const lastSave = page.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' &&
        (res.request().postData() ?? '').includes('Birinci cümle'),
    );
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(body(page)).toContainText('Birinci cümle.');
    // Bekleyen kayıt bitmeden test kapanmasın (sonraki test sayfayı eski revision ile açmasın).
    await lastSave;
    await expect(page.getByText('Kaydedildi')).toBeVisible();
  });

  test('görsel eklenir, kaydedilir ve sayfa yenilenince görünür', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Doküman Görsel' }).click();
    await page.getByRole('complementary').getByRole('link', { name: 'Dokümanlar' }).click();
    await page
      .getByRole('list', { name: 'Sayfa ağacı' })
      .getByRole('button', { name: 'Mimari notları', exact: true })
      .click();

    const saved = page.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' && (res.request().postData() ?? '').includes('"image"'),
    );
    await page.getByTestId('editor-image-input').setInputFiles({
      name: 'sema.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    const image = body(page).locator('img');
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute(
      'src',
      /\/api\/workspaces\/.+\/docs\/.+\/attachments\/.+\?preview=1$/,
    );
    await saved;

    await page.reload();
    await expect(body(page).locator('img')).toHaveCount(1);
    await expect
      .poll(() =>
        body(page)
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
  });

  test('sayfa Word (.docx) olarak indirilir', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Doküman Görsel' }).click();
    await page.getByRole('complementary').getByRole('link', { name: 'Dokümanlar' }).click();
    await page
      .getByRole('list', { name: 'Sayfa ağacı' })
      .getByRole('button', { name: 'Mimari notları', exact: true })
      .click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Word olarak indir' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Mimari notları.docx');
    const path = test.info().outputPath('sayfa.docx');
    await file.saveAs(path);
    // .docx bir ZIP'tir: "PK" imzası.
    const bytes = await (await import('node:fs/promises')).readFile(path);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.length).toBeGreaterThan(2000);
  });

  test('metne bağlantı eklenir; yazdırma görünümü yalnızca sayfayı gösterir', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Doküman Görsel' }).click();
    await page.getByRole('complementary').getByRole('link', { name: 'Dokümanlar' }).click();
    await page
      .getByRole('list', { name: 'Sayfa ağacı' })
      .getByRole('button', { name: 'Mimari notları', exact: true })
      .click();

    await body(page).getByText('Birinci cümle.').click({ clickCount: 3 });
    await page.getByRole('button', { name: 'Bağlantı', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Bağlantı' });
    await dialog.getByRole('textbox').fill('https://example.com/dokuman');
    await dialog.getByRole('button', { name: 'Kaydet' }).click();
    const link = body(page).locator('a[href="https://example.com/dokuman"]');
    await expect(link).toHaveText('Birinci cümle.');
    await expect(page.getByText('Kaydedildi')).toBeVisible();

    // Yazdırma/PDF: yalnızca sayfa gövdesi basılır, kenar çubuğu gizlenir.
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('complementary')).toBeHidden();
    await expect(body(page)).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });
});
