import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-115: Kanban modunda Space — sprintsiz, Space geneli board, sütundan kart ekleme, sürükleme. */
test.describe.serial('Kanban board', () => {
  /** Sütunlar sırayla: Backlog, Yapılacak, Devam ediyor, İncelemede, Tamamlandı. */
  const cell = (page: Page, index: number) => page.locator('[data-status-id]').nth(index);

  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Kanban Space açılır; sütundan kart eklenir, sürüklenir, filtrelenir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const space = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await space.getByLabel('Ad', { exact: true }).fill('Akış');
    await space.getByLabel('Anahtar').fill('AKS');
    await space.getByRole('radio', { name: /Kanban/ }).check();
    await space.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Akış' })).toBeVisible();

    // Sprint bağlantıları yok; Kanban board bağlantısı var.
    await expect(sidebar.getByRole('link', { name: 'Backlog' })).toHaveCount(0);
    await sidebar.getByRole('link', { name: 'Kanban board' }).first().click();
    await expect(page.getByRole('heading', { name: 'Kanban board', level: 2 })).toBeVisible();

    // İlk sütuna kart ekle (Backlog), sonra "Yapılacak" sütununa.
    const addIn = async (index: number, title: string) => {
      await page.getByRole('button', { name: 'Kart ekle' }).nth(index).click();
      const input = page.getByLabel('Yeni kart başlığı');
      await input.fill(title);
      await input.press('Enter');
      await expect(page.getByText(/AKS-\d+ oluşturuldu\./).last()).toBeVisible();
      await input.press('Escape');
    };
    await addIn(0, 'Giriş ekranı');
    await expect(cell(page, 0).getByRole('link', { name: 'Giriş ekranı' })).toBeVisible();
    await addIn(1, 'Şifre sıfırlama');
    await expect(cell(page, 1).getByRole('link', { name: 'Şifre sıfırlama' })).toBeVisible();

    // Sürükle: Giriş ekranı → Devam ediyor.
    const card = cell(page, 0).getByRole('link', { name: 'Giriş ekranı' });
    const from = (await card.boundingBox())!;
    const to = (await cell(page, 2).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 });
    await page.mouse.up();
    await expect(cell(page, 2).getByRole('link', { name: 'Giriş ekranı' })).toBeVisible();

    // Kalıcı.
    await page.reload();
    await expect(cell(page, 2).getByRole('link', { name: 'Giriş ekranı' })).toBeVisible();

    // Metin süzgeci.
    await page.getByLabel('Kartları süz…').fill('Şifre');
    await expect(page.getByRole('link', { name: 'Şifre sıfırlama' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Giriş ekranı' })).toHaveCount(0);
  });
});
