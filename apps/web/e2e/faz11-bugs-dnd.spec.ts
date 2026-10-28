import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-116/117: Bug ekranı (kırmızı Bugs düğmesi) ve listede sürükleyerek Sub-Task yapma / ayırma. */
test.describe.serial('Bug ekranı ve sürükle-bırak', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  const openList = async (page: Page) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Hata Takibi' }).first().click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
  };

  /** Satırı başlığın sağındaki boş yerden tutup taşır (tutamaç gerekmez). */
  async function pickUp(page: Page, from: string) {
    const box = (await page.locator(`[data-item-row="${from}"]`).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4 + 20, box.y + 30, { steps: 5 });
  }

  test('Proje ve iki Task hazırlanır; listede Bug seçeneği yok', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Hata Takibi');
    await dialog.getByLabel('Anahtar').fill('HTK');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Hata Takibi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await expect(page.getByLabel('Tip').first().locator('option[value="BUG"]')).toHaveCount(0);
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    for (const [n, title] of [
      [1, 'Ana iş'],
      [2, 'Küçük iş'],
    ] as const) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`HTK-${n} oluşturuldu.`)).toBeVisible();
    }
  });

  test('Task başka Task üstüne sürüklenir, onaylanınca Sub-Task olur; Ayır ile geri Task olur', async ({
    page,
  }) => {
    await openList(page);
    const target = (await page.locator('[data-item-row="HTK-1"]').boundingBox())!;
    await pickUp(page, 'HTK-2');
    await page.mouse.move(target.x + target.width * 0.4, target.y + target.height / 2, {
      steps: 15,
    });
    // Taşınan satır imleçle gelir ve bırakınca ne olacağını söyler; hedef vurgulanır.
    await expect(page.locator('[data-dnd-overlay]')).toContainText('Küçük iş');
    await expect(page.getByTestId('dnd-intent')).toHaveText('HTK-1 altına Sub-Task olarak taşı');
    await expect(page.locator('[data-item-row="HTK-1"]')).toHaveAttribute(
      'data-drop-state',
      'nest',
    );
    await page.mouse.up();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Sub-Task');
    await confirm.getByRole('button', { name: 'Sub-Task yap' }).click();
    await expect(page.getByText('HTK-2 artık HTK-1 öğesinin Sub-Task’ı.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Sub-task' })).toHaveCount(1);

    // Sürüklerken altta "Ayır" alanı çıkar; oraya bırakınca bağımsız Task olur.
    await pickUp(page, 'HTK-2');
    const zone = page.getByTestId('detach-zone');
    await expect(zone).toBeVisible();
    const z = (await zone.boundingBox())!;
    // Ayır alanı ekranın en altında, listenin üstünü kapatmaz.
    expect(z.y + z.height).toBeGreaterThan(page.viewportSize()!.height - 40);
    await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 15 });
    await expect(page.getByTestId('dnd-intent')).toHaveText('Ayır — bağımsız Task olur');
    await page.mouse.up();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Ayır' }).click();
    await expect(page.getByText('HTK-2 artık bağımsız bir Task.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Sub-task' })).toHaveCount(0);
  });

  test('Sprint panosundaki kırmızı Bugs düğmesi; Bug açılır, atanır, çözülür; listede görünmez', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Hata Takibi' }).first().click();
    await page.getByRole('link', { name: 'Sprint panosu' }).first().click();
    await page.getByTestId('bugs-button').click();
    await expect(page.getByRole('heading', { name: 'Bugs', level: 2 })).toBeVisible();

    await page.getByRole('button', { name: 'Bug aç' }).click();
    const form = page.getByRole('dialog', { name: 'Bug aç' });
    await form.getByLabel('Sorun ne?').fill('Giriş butonu çalışmıyor');
    await form.getByLabel('Önem').selectOption('CRITICAL');
    await form.getByLabel('Tekrar adımları').fill('1. Giriş sayfası 2. Butona bas');
    await form.getByLabel('Ortam').fill('Chrome 140');
    await form.getByRole('button', { name: 'Bug’ı aç' }).click();
    await expect(page.getByText(/HTK-3 açıldı/)).toBeVisible();

    const row = page.getByRole('row', { name: /Giriş butonu çalışmıyor/ });
    await expect(row).toContainText('Kritik');
    await expect(row.getByLabel('HTK-3 durumu')).toHaveValue('UNASSIGNED');

    // Ata: durum Atandı olur.
    await row.getByLabel('HTK-3 atanan').selectOption({ label: 'Zeynep Kaya' });
    await expect(page.getByText('HTK-3 atandı.')).toBeVisible();
    await expect(row.getByLabel('HTK-3 durumu')).toHaveValue('ASSIGNED');

    // Çözüldü.
    await row.getByLabel('HTK-3 durumu').selectOption('RESOLVED');
    await expect(page.getByText('HTK-3 durumu güncellendi.')).toBeVisible();
    await page.getByRole('tab', { name: /Çözüldü/ }).click();
    await expect(page.getByRole('row', { name: /Giriş butonu çalışmıyor/ })).toBeVisible();

    // Liste görünümünde Bug yok.
    await openList(page);
    await expect(page.getByRole('link', { name: 'Ana iş' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Giriş butonu çalışmıyor' })).toHaveCount(0);
  });
});
