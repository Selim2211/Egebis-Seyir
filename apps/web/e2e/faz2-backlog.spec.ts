import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 2.1 akışı: sprint oluştur, Backlog'u sırala, öğeleri sprint'e taşı ve geri al. */
test.describe.serial('Backlog ve sprint', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Space ve üç Story hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Backlog Denemesi');
    await dialog.getByLabel('Anahtar').fill('BKL');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Backlog Denemesi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    for (const [index, title] of ['Giriş ekranı', 'Ödeme akışı', 'Raporlar'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`BKL-${index + 1} oluşturuldu.`)).toBeVisible();
    }
  });

  test('Backlog öncelik sırasıyla listelenir, tahminsizler vurgulanır', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Backlog Denemesi' }).first().click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();

    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await expect(backlog.getByText('3 öğe · 0 puan')).toBeVisible();
    await expect(backlog.getByText('3 tahminsiz')).toBeVisible();
    const titles = backlog.getByRole('link', { name: /Giriş ekranı|Ödeme akışı|Raporlar/ });
    await expect(titles).toHaveText(['Giriş ekranı', 'Ödeme akışı', 'Raporlar']);

    await backlog.getByPlaceholder("Backlog'ta ara…").fill('ödeme');
    await expect(titles).toHaveText(['Ödeme akışı']);
    await backlog.getByRole('button', { name: 'Temizle' }).click();
    await expect(titles).toHaveCount(3);
  });

  test('sprint oluşturulur ve öğeler taşınır, geri alınır', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Backlog Denemesi' }).first().click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();

    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yeni sprint' });
    await expect(dialog.getByLabel('Ad')).toHaveValue('Sprint 1');
    await dialog.getByLabel('Sprint hedefi').fill('Giriş akışı tamamlansın');
    await dialog.getByRole('button', { name: 'Sprint oluştur' }).click();

    const sprint = page.getByRole('region', { name: 'Sprint 1' });
    await expect(sprint).toBeVisible();
    await expect(sprint.getByText('Planlandı')).toBeVisible();
    await expect(sprint.getByText('Giriş akışı tamamlansın')).toBeVisible();

    // Tek öğe menüden, birden çok öğe seçerek taşınır.
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByRole('button', { name: /BKL-1 için işlemler/ }).click();
    await page.getByRole('menuitem', { name: "Sprint 1 sprint'ine taşı" }).click();
    await expect(sprint.getByRole('link', { name: 'Giriş ekranı' })).toBeVisible();
    await expect(backlog.getByRole('link', { name: 'Giriş ekranı' })).toHaveCount(0);

    await backlog.getByLabel('BKL-2 öğesini seç').check();
    await backlog.getByLabel('BKL-3 öğesini seç').check();
    await backlog.getByLabel("Sprint'e taşı…").selectOption({ label: 'Sprint 1' });
    await expect(sprint.getByText('3 öğe · 0 puan')).toBeVisible();
    await expect(backlog.getByText('Backlog boş.')).toBeVisible();

    await sprint.getByRole('button', { name: /BKL-3 için işlemler/ }).click();
    await page.getByRole('menuitem', { name: "Backlog'a geri al" }).click();
    await expect(backlog.getByRole('link', { name: 'Raporlar' })).toBeVisible();
  });

  test('boş sprint silinir', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Backlog Denemesi' }).first().click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();

    await page.getByRole('button', { name: 'Sprint 1 için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Sil' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByRole('region', { name: 'Sprint 1' })).toHaveCount(0);
    // Sprint'teki öğeler Backlog'a döner.
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await expect(backlog.getByRole('link', { name: 'Giriş ekranı' })).toBeVisible();
  });
});
