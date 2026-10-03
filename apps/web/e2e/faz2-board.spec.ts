import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 2.2 akışı: sprint panosu, sürükleyerek ve menüyle durum değişimi, satırlar, List Board'u. */
test.describe.serial('Board', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  /** Sütunlar sırayla: Backlog, Yapılacak, Devam ediyor, İncelemede, Tamamlandı. */
  const cell = (page: Page, index: number) => page.locator('[data-status-id]').nth(index);

  async function openSpace(page: Page) {
    await page.getByRole('complementary').getByRole('link', { name: 'Pano Denemesi' }).click();
  }

  test('Space, iki Story ve sprint hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Pano Denemesi');
    await expect(dialog.getByLabel('Anahtar')).toHaveValue('PAN');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Pano Denemesi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    for (const [index, title] of ['Sepet', 'Kargo takibi'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`PAN-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await openSpace(page);
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    await page
      .getByRole('dialog', { name: 'Yeni sprint' })
      .getByRole('button', { name: 'Sprint oluştur' })
      .click();
    const sprint = page.getByRole('region', { name: 'Sprint 1' });
    await expect(sprint).toBeVisible();

    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByLabel('PAN-1 öğesini seç').check();
    await backlog.getByLabel('PAN-2 öğesini seç').check();
    await backlog.getByLabel("Sprint'e taşı…").selectOption({ label: 'Sprint 1' });
    await expect(sprint.getByText('2 öğe')).toBeVisible();
  });

  test('sprint panosu: kartlar ilk sütunda; menüyle ve sürükleyerek durum değişir', async ({
    page,
  }) => {
    await openSpace(page);
    await page.getByRole('link', { name: 'Sprint panosu' }).first().click();
    await expect(page.getByRole('heading', { name: 'Backlog', level: 2 })).toBeVisible();
    await expect(cell(page, 0).getByRole('link', { name: 'Sepet' })).toBeVisible();
    await expect(cell(page, 0).getByRole('link', { name: 'Kargo takibi' })).toBeVisible();

    // Menü (klavye ve dokunmatik yolu).
    await page.getByRole('button', { name: 'PAN-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Yapılacak' }).click();
    await expect(cell(page, 1).getByRole('link', { name: 'Sepet' })).toBeVisible();
    await expect(cell(page, 0).getByRole('link', { name: 'Sepet' })).toHaveCount(0);

    // Sürükle-bırak.
    const card = cell(page, 0).getByRole('link', { name: 'Kargo takibi' });
    const from = (await card.boundingBox())!;
    const to = (await cell(page, 2).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 });
    await page.mouse.up();
    await expect(cell(page, 2).getByRole('link', { name: 'Kargo takibi' })).toBeVisible();

    // Yenileyince kalıcıdır.
    await page.reload();
    await expect(cell(page, 2).getByRole('link', { name: 'Kargo takibi' })).toBeVisible();
    await expect(cell(page, 1).getByRole('link', { name: 'Sepet' })).toBeVisible();
  });

  test('satırlar önceliğe göre gruplanır; karta tıklayınca yan panel açılır', async ({ page }) => {
    await openSpace(page);
    await page.getByRole('link', { name: 'Sprint panosu' }).first().click();
    await page.getByLabel('Satırlar').selectOption('priority');
    await expect(page).toHaveURL(/lane=priority/);
    await expect(page.getByText('Normal', { exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Sepet' }).first().click();
    await expect(page).toHaveURL(/item=PAN-1/);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('List sayfasının Board sekmesi listedeki öğeleri gösterir', async ({ page }) => {
    await openSpace(page);
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await page.getByRole('tab', { name: 'Board' }).click();
    await expect(page).toHaveURL(/view=board/);
    await expect(page.getByRole('link', { name: 'Sepet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Kargo takibi' })).toBeVisible();
  });
});
