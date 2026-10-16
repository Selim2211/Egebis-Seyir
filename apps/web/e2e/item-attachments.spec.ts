import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-114: her dosya türü eklenir (Task ve Epic); çalıştırılabilirler yalnızca indirilir. */
test.describe.serial('Dosya ekleme', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Epic oluştururken dosya eklenir; Task detayına exe, zip ve Türkçe adlı dosya yüklenir', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const space = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await space.getByLabel('Ad', { exact: true }).fill('Ekler');
    await space.getByLabel('Anahtar').fill('EKL');
    await space.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Ekler' })).toBeVisible();

    // Epic: oluştururken dosya seç.
    await page.getByTestId('new-menu').click();
    await page.getByRole('menuitem', { name: /^Epic/ }).click();
    const dialog = page.getByRole('dialog', { name: 'New Epic' });
    await dialog.getByLabel('Başlık').fill('Ekli Epic');
    await dialog.getByTestId('new-item-files').setInputFiles({
      name: 'plan.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx-icerik'),
    });
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/items\/EKL-1/);
    const attachments = page.getByRole('region', { name: 'Ekler' });
    await expect(attachments.getByText('plan.docx')).toBeVisible();

    // Task: detayda exe, zip, Türkçe adlı dosya.
    await page.getByTestId('new-menu').click();
    await page.getByRole('menuitem', { name: /^Task/ }).click();
    await page.getByRole('dialog', { name: 'New Task' }).getByLabel('Başlık').fill('Ekli Task');
    await page
      .getByRole('dialog', { name: 'New Task' })
      .getByRole('button', { name: 'Create' })
      .click();
    await expect(page).toHaveURL(/\/items\/EKL-2/);

    const region = page.getByRole('region', { name: 'Ekler' });
    await region.locator('input[type=file]').setInputFiles([
      { name: 'kurulum.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') },
      { name: 'arsiv.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') },
      {
        name: 'Çalışma Planı (final).xlsx',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('x'),
      },
    ]);
    await expect(region.getByText('kurulum.exe')).toBeVisible();
    await expect(region.getByText('arsiv.zip')).toBeVisible();
    await expect(region.getByText('Çalışma Planı (final).xlsx')).toBeVisible();
  });
});
