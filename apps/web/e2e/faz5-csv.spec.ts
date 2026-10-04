import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 5.7: CSV dışa aktarma ve içe aktarma sihirbazı. */
test.describe.serial('CSV içe/dışa aktarma', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('liste CSV olarak indirilir; CSV eşlenip önizlenir ve içe aktarılır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('CSV Testi');
    await dialog.getByLabel('Anahtar').fill('CSV');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'CSV Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Dışa aktarılacak iş');
    await quick.press('Enter');
    await expect(page.getByText('CSV-1 oluşturuldu.')).toBeVisible();

    // Dışa aktar.
    await page.getByRole('button', { name: 'Veri' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'CSV olarak dışa aktar' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const text = await readFile(await file.path(), 'utf8');
    expect(text).toContain('Dışa aktarılacak iş');
    expect(text).toContain('CSV-1');

    // İçe aktar: noktalı virgüllü Türkçe başlıklı dosya, biri hatalı satır.
    const csv = [
      'Başlık;Tip;Durum;Öncelik;Bitiş',
      'Rapor hazırla;Görev;Yapılacak;Yüksek;15.12.2026',
      'Sunum yap;Görev;Yapılacak;;',
      'Hatalı durum;Görev;Yokdurum;;',
    ].join('\n');
    await page.getByRole('button', { name: 'Veri' }).click();
    await page.getByRole('menuitem', { name: 'CSV’den içe aktar…' }).click();
    const wizard = page.getByRole('dialog', { name: 'CSV’den içe aktar' });
    await wizard
      .getByLabel('CSV dosyası')
      .setInputFiles({ name: 'isler.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await expect(wizard.getByRole('status')).toContainText(
      '3 satır: 2 içe aktarılabilir, 1 sorunlu',
    );
    await expect(wizard.getByLabel('Başlık sütunu')).toHaveValue('Başlık');
    await expect(wizard.getByText(/Satır 4/)).toBeVisible();

    await wizard.getByRole('button', { name: '2 işi içe aktar' }).click();
    await expect(wizard.getByRole('status').last()).toContainText('2 oluşturuldu');
    await wizard.getByRole('button', { name: 'Kapat' }).first().click();
    await expect(page.getByRole('link', { name: 'Rapor hazırla' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sunum yap' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hatalı durum' })).toHaveCount(0);
  });
});
