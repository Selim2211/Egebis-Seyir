import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 8.5: Space yedeği şifreli alınır, yeni Space olarak geri yüklenir ya da Proje yedeğe döndürülür (ADR-173). */
test.describe.serial('Proje yedek ve geri yükleme', () => {
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
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill(name);
    await dialog.getByLabel('Anahtar').fill(key);
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  };

  test('kaynak Proje hazırlanır ve yedeği indirilir', async ({ page }) => {
    await createSpace(page, 'Yedek Kaynak', 'BKP');
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    for (const [index, title] of ['Yedeklenecek hikâye', 'İkinci hikâye'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`BKP-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await page.goto('/');
    await page.getByRole('link', { name: 'Yedek Kaynak' }).first().click();
    await page.getByRole('link', { name: 'Proje ayarları' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Proje yedeğini indir (ZIP)' }).click();
    const file = await download;
    // Yedek AES-256 ile şifreli iner (ADR-171).
    expect(file.suggestedFilename()).toMatch(/\.zip\.enc$/);
    backupFile = test.info().outputPath('yedek.zip.enc');
    await file.saveAs(backupFile);
  });

  test('yedekten yeni Proje geri yüklenir', async ({ page }) => {
    await page.goto('/settings/general');
    await page.getByRole('button', { name: 'Yedekten Proje yükle…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yedekten Proje yükle…' });
    await dialog.getByLabel('Yedek dosyası (.zip)').setInputFiles(backupFile);
    await dialog.getByLabel('Yeni Proje anahtarı').fill('BKP2');
    await dialog.getByLabel(/Yeni Proje adı/).fill('Yedek Kopya');
    await dialog.getByRole('button', { name: 'Geri yükle' }).click();
    await expect(page.getByText('Proje yedekten geri yüklendi.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yedek Kopya' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await expect(page.getByText('BKP2-1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Yedeklenecek hikâye' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'İkinci hikâye' })).toBeVisible();
  });

  test('kullanılmış anahtar anlaşılır hatayla reddedilir', async ({ page }) => {
    await page.goto('/settings/general');
    await page.getByRole('button', { name: 'Yedekten Proje yükle…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yedekten Proje yükle…' });
    await dialog.getByLabel('Yedek dosyası (.zip)').setInputFiles(backupFile);
    await dialog.getByLabel('Yeni Proje anahtarı').fill('BKP');
    await dialog.getByRole('button', { name: 'Geri yükle' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
  });

  test('Proje yedeğe döndürülür: uyarı, dosya seçimi, anahtar onayı, eski hâl', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Yedek Kaynak' }).first().click();
    // Yedekten sonra yeni bir iş eklenir.
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    await quick.fill('Yedekten sonra eklenen');
    await quick.press('Enter');
    await expect(page.getByText('BKP-3 oluşturuldu.')).toBeVisible();

    await page.goto('/');
    await page.getByRole('link', { name: 'Yedek Kaynak' }).first().click();
    await page.getByRole('link', { name: 'Proje ayarları' }).click();
    await page.getByRole('button', { name: 'Yedeğe geri dön' }).click();

    // 1) Önemli uyarı penceresi.
    const warn = page.getByTestId('rollback-warn');
    await expect(warn).toContainText('şu anki verileriniz değişecek');
    await expect(warn.getByRole('link', { name: 'Şu anki halin yedeğini indir' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('rollback-uyari.png') });
    await warn.getByRole('button', { name: 'Devam et' }).click();

    // 2) Yedek seçme ekranı: anahtar yazılana kadar düğme kapalı.
    const pick = page.getByTestId('rollback-pick');
    await pick.getByLabel('Yedek dosyası (.zip)').setInputFiles(backupFile);
    const submit = pick.getByRole('button', { name: 'Yedeğe döndür' });
    await expect(submit).toBeDisabled();
    await pick.getByLabel(/Proje anahtarını yaz/).fill('YANLIS');
    await expect(submit).toBeDisabled();
    await pick.getByLabel(/Proje anahtarını yaz/).fill('BKP');
    await page.screenshot({ path: test.info().outputPath('rollback-secim.png') });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByText('Proje yedeğe döndürüldü.')).toBeVisible();

    // 3) Yedekteki hâle döndü: sonradan eklenen yok, yedektekiler var; Proje çalışmaya devam ediyor.
    await page.goto('/');
    await page.getByRole('link', { name: 'Yedek Kaynak' }).first().click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await expect(page.getByRole('link', { name: 'Yedeklenecek hikâye' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'İkinci hikâye' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Yedekten sonra eklenen' })).toHaveCount(0);
    await page.getByLabel('Tip').first().selectOption('TASK');
    await page.getByRole('textbox', { name: 'Başlık' }).fill('Dönüşten sonra yeni iş');
    await page.getByRole('textbox', { name: 'Başlık' }).press('Enter');
    await expect(page.getByText(/BKP-\d+ oluşturuldu\./)).toBeVisible();
  });
});
