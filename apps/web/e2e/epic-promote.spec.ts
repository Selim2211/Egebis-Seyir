import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-109: Task isteğe bağlı olarak Epic'e dönüştürülür; Sub-Task'ları Task olur. */
test.describe.serial("Task'ı Epic'e dönüştürme", () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Task, Sub-Task ve Bug hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Epic Denemesi');
    await dialog.getByLabel('Anahtar').fill('EPD');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Epic Denemesi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    await quick.fill('Büyük iş');
    await quick.press('Enter');
    await expect(page.getByText('EPD-1 oluşturuldu.')).toBeVisible();
    await page.getByLabel('Tip').first().selectOption('BUG');
    await quick.fill('Bir Bug');
    await quick.press('Enter');
    await expect(page.getByText('EPD-2 oluşturuldu.')).toBeVisible();

    await page.getByRole('button', { name: 'EPD-1 için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Alt öğe ekle' }).click();
    const child = page.getByPlaceholder(/Alt öğe ekle/);
    await child.fill('Küçük parça');
    await child.press('Enter');
    await expect(page.getByText('Küçük parça')).toBeVisible();
  });

  test('yalnızca Task satırında seçenek var; onaylayınca Epic olur, Sub-Task Task olur', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Epic Denemesi' }).first().click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    // Bug'da seçenek yok.
    await page.getByRole('button', { name: 'EPD-2 için işlemler' }).click();
    await expect(page.getByRole('menuitem', { name: "Epic'e dönüştür" })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Vazgeçilirse hiçbir şey değişmez.
    await page.getByRole('button', { name: 'EPD-1 için işlemler' }).click();
    await page.getByRole('menuitem', { name: "Epic'e dönüştür" }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('geri alınamaz');
    await confirm.getByRole('button', { name: 'İptal' }).click();
    await expect(page.getByRole('img', { name: 'Epic' })).toHaveCount(0);

    // Onaylanınca Epic olur; Sub-Task Task'a döner.
    await page.getByRole('button', { name: 'EPD-1 için işlemler' }).click();
    await page.getByRole('menuitem', { name: "Epic'e dönüştür" }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: "Epic'e dönüştür" }).click();
    await expect(page.getByText('EPD-1 artık bir Epic.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Epic' })).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'Sub-task' })).toHaveCount(0);

    await page.goto('/items/EPD-3');
    await expect(page.getByRole('img', { name: 'Task' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'EPD-1' }).first()).toBeVisible();
  });
});
