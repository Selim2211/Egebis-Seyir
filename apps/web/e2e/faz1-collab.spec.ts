import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

// 1x1 saydam PNG (geçerli içerik imzası).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Faz 1.6 akışı: yorum, tepki, @mention, ek, aktivite, Ana sayfa, profil fotoğrafı. */
test.describe.serial('Yorum, ek, aktivite ve Ana sayfa', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  async function openItem(page: Page) {
    await page.goto('/items/IMP-1');
  }

  test('Space ve iş öğesi hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('İşbirliği');
    await dialog.getByLabel('Anahtar').fill('IMP');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'İşbirliği' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Ödeme servisi');
    await quick.press('Enter');
    await expect(page.getByText('IMP-1 oluşturuldu.')).toBeVisible();
  });

  test('yorum yazılır, düzenlenir, tepki verilir ve silinir', async ({ page }) => {
    await openItem(page);
    const editor = page.getByRole('textbox', { name: /Yorum yaz/ });
    await editor.click();
    await page.keyboard.type('İlk yorumum');
    await page.getByRole('button', { name: 'Yorum yap' }).click();
    await expect(page.getByText('İlk yorumum')).toBeVisible();

    // @mention: kendini etiketle.
    await editor.click();
    await page.keyboard.type('Merhaba @Zey');
    await expect(page.getByRole('option', { name: /Zeynep Kaya/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+Enter');
    await expect(page.getByText('@Zeynep Kaya')).toBeVisible();

    // Tepki.
    await page.getByRole('button', { name: 'Tepki ekle' }).first().click();
    await page.getByRole('menuitem', { name: '👍' }).click();
    await expect(page.getByRole('button', { name: /👍 tepkisi, 1 kişi/ })).toBeVisible();

    // Düzenle.
    await page
      .getByRole('button', { name: /yorumu için işlemler/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Düzenle' }).click();
    await page
      .getByRole('textbox', { name: /Yorum yaz/ })
      .first()
      .click();
    await page.keyboard.press('End');
    await page.keyboard.type(' (düzeltildi)');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('İlk yorumum (düzeltildi)')).toBeVisible();
    await expect(page.getByText('(düzenlendi)')).toBeVisible();

    // Sil.
    await page
      .getByRole('button', { name: /yorumu için işlemler/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Sil' }).click();
    await expect(page.getByText('İlk yorumum (düzeltildi)')).toHaveCount(0);
  });

  test('dosya eklenir, resim önizlenir, yasaklı tür reddedilir, silinir', async ({ page }) => {
    await openItem(page);
    await page.getByRole('region', { name: 'Ekler' }).locator('input[type="file"]').setInputFiles({
      name: 'ekran.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await expect(page.getByRole('link', { name: 'ekran.png', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ekran.png önizle' })).toBeVisible();
    await page
      .getByRole('region', { name: 'Ekler' })
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'kurulum.exe',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('MZ'),
      });
    await expect(page.getByText(/güvenlik nedeniyle izin verilmiyor/)).toBeVisible();

    await page.getByRole('button', { name: 'ekran.png ekini sil' }).click();
    await expect(page.getByRole('link', { name: 'ekran.png', exact: true })).toHaveCount(0);
  });

  test('aktivite sekmesi değişiklikleri okunur cümlelerle gösterir', async ({ page }) => {
    await openItem(page);
    await page.getByRole('button', { name: 'IMP-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Devam ediyor' }).click();
    await page.getByRole('tab', { name: 'Aktivite' }).click();
    await expect(page.getByText('Durum: Backlog → Devam ediyor')).toBeVisible();
    await expect(page.getByText('oluşturdu.')).toBeVisible();
    await expect(page.getByText('dosya ekledi: ekran.png')).toBeVisible();
  });

  test('Ana sayfa: atananlar, favoriler ve son aktivite görünür', async ({ page }) => {
    await page.goto('/items/IMP-1');
    await page.getByRole('button', { name: 'Atananları değiştir' }).click();
    await page.getByRole('menuitemcheckbox', { name: /Zeynep Kaya/ }).click();
    await page.keyboard.press('Escape');

    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Bana atananlar' })).toContainText(
      'Ödeme servisi',
    );
    await expect(page.getByRole('region', { name: 'Son aktivite' })).toContainText('IMP-1');
    await expect(page.getByRole('region', { name: 'Favoriler' })).toBeVisible();
  });

  test('profil fotoğrafı yüklenir ve kaldırılır', async ({ page }) => {
    await page.goto('/settings/profile');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'ben.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await expect(page.getByText('Profil fotoğrafı güncellendi.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fotoğrafı kaldır' })).toBeVisible();
    await page.getByRole('button', { name: 'Fotoğrafı kaldır' }).click();
    await expect(page.getByRole('button', { name: 'Fotoğraf ekle' })).toBeVisible();
  });
});
