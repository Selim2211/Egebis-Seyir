import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 4.6: pano widget'ları, özelleştirme (gizle/göster/sırala/boyutlandır) ve CSV dışa aktarma. */
test.describe.serial('Pano', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  const open = async (page: Page) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Pano Testi' }).click();
    await sidebar.getByRole('link', { name: 'Panel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Panel', exact: true })).toBeVisible();
  };

  test('varsayılan widget’lar görünür; akış verisi gelir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Pano Testi');
    await dialog.getByLabel('Anahtar').fill('PNO');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Pano Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    await quick.fill('Bir görev');
    await quick.press('Enter');
    await expect(page.getByText('PNO-1 oluşturuldu.')).toBeVisible();

    await open(page);
    for (const name of [
      'Aktif sprint',
      'Velocity',
      'Kümülatif akış (CFD)',
      'Throughput',
      'Bug trendi',
    ]) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('img', { name: 'Kümülatif akış grafiği' })).toBeVisible();
    await expect(page.getByText('Bu dönemde tamamlanan iş yok.')).toBeVisible();
  });

  test('widget gizlenir, geri eklenir ve düzen kalıcıdır', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Özelleştir' }).click();
    await page.getByRole('button', { name: 'Throughput widget’ını gizle' }).click();
    await expect(page.getByRole('heading', { name: 'Throughput', exact: true })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Panel', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Throughput', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Özelleştir' }).click();
    const hidden = page.getByRole('region', { name: 'Gizli widget’lar' });
    await hidden.getByRole('button', { name: 'Throughput' }).click();
    await expect(page.getByRole('heading', { name: 'Throughput', exact: true })).toBeVisible();
  });

  test('widget boyutu değişir ve yukarı taşınır', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Özelleştir' }).click();
    const velocity = page.locator('[data-widget="velocity"]');
    await expect(velocity).not.toHaveClass(/col-span-2/);
    await page.getByRole('button', { name: 'Velocity widget’ını genişlet' }).click();
    await expect(velocity).toHaveClass(/col-span-2/);

    const order = async () =>
      page
        .locator('[data-widget]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-widget')));
    const before = await order();
    await page.getByRole('button', { name: 'Velocity widget’ını yukarı taşı' }).click();
    const after = await order();
    expect(after.indexOf('velocity')).toBe(before.indexOf('velocity') - 1);
  });

  test('akış CSV olarak indirilir', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('img', { name: 'Kümülatif akış grafiği' })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV indir' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^akis-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
