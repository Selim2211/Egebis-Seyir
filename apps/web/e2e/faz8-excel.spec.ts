import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 8.4: sprint Excel'e aktarılır, başka Space'e içe aktarılır. */
test.describe.serial('Sprint Excel dışa/içe aktarma', () => {
  let exported = '';

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
  const openBacklog = async (page: Page, space: string) => {
    await page.goto('/');
    await page.getByRole('link', { name: space }).first().click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
  };

  test('kaynak Space: iki Story ve sprint hazırlanır, Excel indirilir', async ({ page }) => {
    await createSpace(page, 'Excel Kaynak', 'XLS');
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    for (const [index, title] of ['Ödeme ekranı', 'Fatura listesi'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`XLS-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await openBacklog(page, 'Excel Kaynak');
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const create = page.getByRole('dialog', { name: 'Yeni sprint' });
    await create.getByLabel('Ad').fill('Excel Sprint');
    await create.getByRole('button', { name: 'Sprint oluştur' }).click();
    const sprint = page.getByRole('region', { name: 'Excel Sprint' });
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByLabel('XLS-1 öğesini seç').check();
    await backlog.getByLabel('XLS-2 öğesini seç').check();
    await backlog.getByLabel("Sprint'e taşı…").selectOption({ label: 'Excel Sprint' });
    await expect(sprint.getByText('2 öğe · 0 puan')).toBeVisible();

    await sprint.getByRole('button', { name: 'Excel Sprint için işlemler' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Excel’e aktar' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
    exported = test.info().outputPath('sprint.xlsx');
    await file.saveAs(exported);
  });

  test('hedef Space: Excel içe aktarılır, yeni sprint ve öğeler oluşur', async ({ page }) => {
    await createSpace(page, 'Excel Hedef', 'XLT');
    await openBacklog(page, 'Excel Hedef');
    await page.getByRole('main').getByRole('button', { name: 'Excel', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Excel’den içe aktar…' }).click();

    const dialog = page.getByRole('dialog', { name: 'Excel’den sprint içe aktar' });
    await dialog.getByLabel('Excel dosyası (.xlsx)').setInputFiles(exported);
    await expect(dialog.getByRole('status')).toContainText('Excel Sprint: 2 öğe');
    await dialog.getByRole('button', { name: 'İçe aktar' }).click();
    await expect(page.getByText(/Excel Sprint içe aktarıldı: 2 yeni/)).toBeVisible();

    const sprint = page.getByRole('region', { name: 'Excel Sprint' });
    await expect(sprint.getByRole('link', { name: 'Ödeme ekranı' })).toBeVisible();
    await expect(sprint.getByRole('link', { name: 'Fatura listesi' })).toBeVisible();
    await expect(sprint.getByText(/^XLT-\d+$/).first()).toBeVisible();
  });
});
