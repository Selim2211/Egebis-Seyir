import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 8.5: Space yedeği ZIP olarak alınır ve yeni Space olarak geri yüklenir. */
test.describe.serial('Space yedek ve geri yükleme', () => {
  let backupFile = '';

  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  const createSpace = async (page: Page, name: string, key: string) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill(name);
    await dialog.getByLabel('Anahtar').fill(key);
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  };

  test('kaynak Space hazırlanır ve yedeği indirilir', async ({ page }) => {
    await createSpace(page, 'Yedek Kaynak', 'BKP');
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    for (const [index, title] of ['Yedeklenecek hikâye', 'İkinci hikâye'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`BKP-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await page.goto('/');
    await page.getByRole('link', { name: 'Yedek Kaynak' }).first().click();
    await page.getByRole('link', { name: 'Space ayarları' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Space yedeğini indir (ZIP)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.zip$/);
    backupFile = test.info().outputPath('yedek.zip');
    await file.saveAs(backupFile);
  });

  test('yedekten yeni Space geri yüklenir', async ({ page }) => {
    await page.goto('/settings/general');
    await page.getByRole('button', { name: 'Yedekten Space yükle…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yedekten Space yükle…' });
    await dialog.getByLabel('Yedek dosyası (.zip)').setInputFiles(backupFile);
    await dialog.getByLabel('Yeni Space anahtarı').fill('BKP2');
    await dialog.getByLabel(/Yeni Space adı/).fill('Yedek Kopya');
    await dialog.getByRole('button', { name: 'Geri yükle' }).click();
    await expect(page.getByText('Space yedekten geri yüklendi.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yedek Kopya' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await expect(page.getByText('BKP2-1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Yedeklenecek hikâye' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'İkinci hikâye' })).toBeVisible();
  });

  test('kullanılmış anahtar anlaşılır hatayla reddedilir', async ({ page }) => {
    await page.goto('/settings/general');
    await page.getByRole('button', { name: 'Yedekten Space yükle…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yedekten Space yükle…' });
    await dialog.getByLabel('Yedek dosyası (.zip)').setInputFiles(backupFile);
    await dialog.getByLabel('Yeni Space anahtarı').fill('BKP');
    await dialog.getByRole('button', { name: 'Geri yükle' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
  });
});
