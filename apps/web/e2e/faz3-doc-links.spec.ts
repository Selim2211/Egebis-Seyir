import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 3.3: dokümana görev bağlama, görevde doküman listesi ve sayfa yorumu. */
test.describe.serial('Doküman bağlantıları ve yorumları', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('görev bağlanır; görev sayfasında doküman görünür', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Bağlantı Testi');
    await dialog.getByLabel('Anahtar').fill('BGL');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Bağlantı Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    await quick.fill('Parola sıfırlama');
    await quick.press('Enter');
    await expect(page.getByText('BGL-1 oluşturuldu.')).toBeVisible();

    await sidebar.getByRole('link', { name: 'Dokümanlar' }).last().click();
    await page
      .getByRole('region', { name: 'Doküman sayfası' })
      .getByRole('button', { name: 'Yeni sayfa' })
      .click();
    await page.getByRole('textbox', { name: 'Sayfa başlığı' }).fill('Parola PRD');
    await expect(page.getByText('Kaydedildi')).toBeVisible();

    await page.getByRole('button', { name: 'Görev bağla' }).click();
    await page.getByRole('textbox', { name: 'Başlık veya MOB-12 ile ara…' }).fill('Parola');
    await page.getByRole('button', { name: /BGL-1 Parola sıfırlama/ }).click();
    const links = page.getByRole('region', { name: 'Bağlı görevler' });
    await expect(links.getByRole('link', { name: /BGL-1/ })).toBeVisible();

    await links.getByRole('link', { name: /BGL-1/ }).click();
    await expect(page).toHaveURL(/\/items\/BGL-1/);
    await expect(page.getByRole('link', { name: 'Parola PRD' })).toBeVisible();
  });

  test('sayfaya yorum yazılır; bağlantı kaldırılır', async ({ page }) => {
    await page.goto('/items/BGL-1');
    await page.getByRole('link', { name: 'Parola PRD' }).click();
    await expect(page.getByRole('textbox', { name: 'Sayfa başlığı' })).toHaveValue('Parola PRD');

    const editor = page.getByRole('textbox', { name: 'Yorum yaz… @ ile birini etiketle' });
    await editor.click();
    await page.keyboard.type('Kapsam net, onaylıyorum.');
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText('Kapsam net, onaylıyorum.')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Kapsam net, onaylıyorum.')).toBeVisible();

    await page.getByRole('button', { name: 'BGL-1 bağlantısını kaldır' }).click();
    await expect(
      page.getByRole('region', { name: 'Bağlı görevler' }).getByRole('link'),
    ).toHaveCount(0);
    await page.goto('/items/BGL-1');
    await expect(page.getByRole('link', { name: 'Parola PRD' })).toHaveCount(0);
  });
});
