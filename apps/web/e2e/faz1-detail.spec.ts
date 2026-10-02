import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 1.4 akışı: yan panel → açıklama → kabul kriteri → böl → bağlantı → engelleyen uyarısı → tam sayfa. */
test.describe.serial('Görev detayı', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  async function openList(page: Page) {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Detay Testi' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
  }

  const panel = (page: Page) => page.getByRole('dialog');

  test('Space ve iki iş öğesi hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Detay Testi');
    await expect(dialog.getByLabel('Anahtar')).toHaveValue('DET');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Detay Testi' })).toBeVisible();

    await openList(page);
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    await quick.fill('Sipariş akışı');
    await quick.press('Enter');
    await expect(page.getByText('DET-1 oluşturuldu.')).toBeVisible();
    await page.getByLabel('Tip').first().selectOption('TASK');
    await quick.fill('Ödeme formu');
    await quick.press('Enter');
    await expect(page.getByText('DET-2 oluşturuldu.')).toBeVisible();
  });

  test('başlığa tıklayınca yan panel açılır; açıklama ve kabul kriteri kaydedilir', async ({
    page,
  }) => {
    await openList(page);
    await page.getByRole('link', { name: 'Sipariş akışı' }).click();
    await expect(page).toHaveURL(/item=DET-1/);
    await expect(panel(page).getByRole('textbox', { name: 'Başlık' })).toHaveValue('Sipariş akışı');

    // Açıklama: yaz, odak çıkınca kaydedilir.
    const editor = panel(page).getByRole('textbox', { name: 'Açıklama' });
    await editor.click();
    await page.keyboard.type('Müşteri sepeti onaylayıp ödeme yapar.');
    await panel(page).getByRole('textbox', { name: 'Başlık' }).click();

    // Kabul kriteri.
    const criterion = panel(page).getByRole('textbox', { name: /Kabul kriteri ekle/ });
    await criterion.fill('Given sepet dolu When öde tıklanır Then ödeme sayfası açılır');
    await criterion.press('Enter');
    const check = panel(page).getByRole('checkbox', { name: /Given sepet dolu/ });
    await check.check();
    await expect(panel(page).getByText('1/1')).toBeVisible();

    // Kapat ve yeniden aç: içerik kalıcı.
    await panel(page).getByRole('button', { name: 'Kapat' }).first().click();
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'Sipariş akışı' }).click();
    await expect(panel(page).getByText('Müşteri sepeti onaylayıp ödeme yapar.')).toBeVisible();
    await expect(panel(page).getByRole('checkbox', { name: /Given sepet dolu/ })).toBeChecked();
  });

  test("Story Task'lara bölünür", async ({ page }) => {
    await page.goto('/items/DET-1');
    await page.getByRole('button', { name: "Task'lara böl" }).click();
    await page
      .getByRole('textbox', { name: 'Task başlıkları' })
      .fill('API uç noktası\nArayüz formu');
    await page.getByRole('button', { name: 'Böl', exact: true }).click();
    await expect(page.getByText('2 Task oluşturuldu.')).toBeVisible();
    await expect(page.getByRole('link', { name: /API uç noktası/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Arayüz formu/ })).toBeVisible();
  });

  test('bağlantı eklenir; engelleyeni açık öğe başlatılırken uyarılır', async ({ page }) => {
    // DET-2 (Ödeme formu), DET-1'i engeller.
    await page.goto('/items/DET-2');
    await page.getByRole('button', { name: 'Bağlantı ekle' }).click();
    await page.getByRole('textbox', { name: /Başlık veya/ }).fill('Sipariş');
    await page.getByRole('button', { name: /DET-1/ }).click();
    await expect(page.getByText('Engelliyor')).toBeVisible();

    await page.goto('/items/DET-1');
    await expect(page.getByText('Tarafından engelleniyor')).toBeVisible();
    await expect(page.getByText('Engel açık')).toBeVisible();

    await page.getByRole('button', { name: 'DET-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Devam ediyor' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Bu öğe engelleniyor' });
    await expect(dialog).toContainText('DET-2');
    await dialog.getByRole('button', { name: 'Yine de başla' }).click();
    await expect(page.getByRole('button', { name: 'DET-1 durumunu değiştir' })).toContainText(
      'Devam ediyor',
    );
  });

  test('tam sayfada özellikler düzenlenir ve izleme açılıp kapanır', async ({ page }) => {
    await page.goto('/items/DET-1');
    await page.getByLabel('Bitiş').fill('2026-12-31');
    await expect(page.getByLabel('Bitiş')).toHaveValue('2026-12-31');
    await page.getByLabel('Story Point').selectOption('5');
    await expect(page.getByLabel('Story Point')).toHaveValue('5');

    // Oluşturan otomatik izleyicidir.
    await expect(page.getByRole('button', { name: /İzlemeyi bırak/ })).toBeVisible();
    await page.getByRole('button', { name: /İzlemeyi bırak/ }).click();
    await expect(page.getByRole('button', { name: /^İzle/ })).toBeVisible();

    await page.goto('/items/YOK-1');
    await expect(page.getByRole('heading', { name: 'Bulunamadı' })).toBeVisible();
  });
});
