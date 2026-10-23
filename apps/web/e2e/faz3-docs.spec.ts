import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 3.2: doküman sayfaları: ağaç, editör, otomatik kayıt, tablo, sürüm geçmişi, çöp kutusu. */
test.describe.serial('Dokümanlar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  async function openDocs(page: Page) {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Doküman Testi' }).click();
    await sidebar.getByRole('link', { name: 'Dokümanlar' }).click();
    await expect(page.getByRole('heading', { name: 'Sayfalar' })).toBeVisible();
  }

  const body = (page: Page) => page.getByRole('textbox', { name: 'Sayfa içeriği' });

  test('ilk sayfa oluşturulur; başlık ve içerik otomatik kaydedilir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Doküman Testi');
    await dialog.getByLabel('Anahtar').fill('DOK');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Doküman Testi' })).toBeVisible();

    await openDocs(page);
    await expect(page.getByText('Bu Proje için ilk doküman sayfasını oluştur.')).toBeVisible();
    await page
      .getByRole('region', { name: 'Doküman sayfası' })
      .getByRole('button', { name: 'Yeni sayfa' })
      .click();

    const title = page.getByRole('textbox', { name: 'Sayfa başlığı' });
    await expect(title).toHaveValue('Başlıksız sayfa');
    await title.fill('Ürün gereksinimleri');
    const contentSaved = page.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' &&
        (res.request().postData() ?? '').includes('Kullanıcılar giriş'),
    );
    await body(page).click();
    await page.keyboard.type('Kullanıcılar giriş yapabilmeli.');
    await contentSaved;
    await expect(page.getByText('Kaydedildi')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Sayfa başlığı' })).toHaveValue(
      'Ürün gereksinimleri',
    );
    await expect(body(page)).toContainText('Kullanıcılar giriş yapabilmeli.');
    await expect(
      page
        .getByRole('list', { name: 'Sayfa ağacı' })
        .getByRole('button', { name: 'Ürün gereksinimleri', exact: true }),
    ).toBeVisible();
  });

  test('tablo eklenir; alt sayfa ağaçta girintili görünür', async ({ page }) => {
    await openDocs(page);
    const tree = page.getByRole('list', { name: 'Sayfa ağacı' });
    await tree.getByRole('button', { name: 'Ürün gereksinimleri', exact: true }).click();
    await body(page).click();
    // Word'deki gibi: Tablo düğmesi → ızgaradan 3×3 seç.
    await page.getByTestId('table-menu').click();
    await page.locator('[data-cell="3x3"]').hover();
    await expect(page.getByText('3 satır × 3 sütun')).toBeVisible();
    await page.locator('[data-cell="3x3"]').click();
    await expect(body(page).locator('table')).toBeVisible();
    await expect(body(page).locator('th')).toHaveCount(3);
    await expect(body(page).locator('tr')).toHaveCount(3);

    // Tablo içindeyken aynı düğme tablo araçlarını açar.
    await body(page).locator('td').first().click();
    const tools = async (name: string) => {
      await page.getByTestId('table-menu').click();
      await page.getByRole('button', { name }).click();
      await page.keyboard.press('Escape');
    };
    await tools('Alta satır ekle');
    await expect(body(page).locator('tr')).toHaveCount(4);
    await tools('Sağa sütun ekle');
    await expect(body(page).locator('th')).toHaveCount(4);
    await page.getByTestId('table-menu').click();
    await page.getByRole('radio', { name: '#fef9c3' }).click();
    await page.keyboard.press('Escape');
    await expect(body(page).locator('td[data-bg="#fef9c3"]')).toHaveCount(1);

    // İki hücre seçilip birleştirilir.
    const cells = body(page).locator('tr').nth(1).locator('td');
    await cells.nth(0).click();
    await cells.nth(1).click({ modifiers: ['Shift'] });
    await tools('Hücreleri birleştir');
    await expect(body(page).locator('td[colspan="2"]')).toHaveCount(1);

    // Hücredeki metin ortalanır ya da sağa hizalanır (Word'deki gibi).
    const last = body(page).locator('tr').nth(2).locator('td').first();
    await last.click();
    await last.pressSequentially('Ortalı');
    await page.getByRole('button', { name: 'Sağa hizala' }).click();
    await expect(last.locator('p')).toHaveCSS('text-align', 'right');
    await page.getByRole('button', { name: 'Ortala' }).click();
    await expect(last.locator('p')).toHaveCSS('text-align', 'center');
    // Alandan çıkınca bekleyen kayıt hemen gider; sunucu yanıtı gelmeden yeniden yükleme yapılmaz.
    const flushed = page.waitForResponse(
      (r) => r.url().includes('/docs/') && r.request().method() !== 'GET',
    );
    await page.getByRole('textbox', { name: 'Sayfa başlığı' }).click();
    await flushed;

    // Kaydedilen tablo (birleşik hücre, renk) sunucu doğrulamasından geçer ve geri yüklenir.
    await page.reload();
    await expect(body(page).locator('td[colspan="2"]')).toHaveCount(1);
    await expect(body(page).locator('th')).toHaveCount(4);
    await expect(body(page).locator('td p[style*="text-align: center"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Ürün gereksinimleri altına sayfa ekle' }).click();
    await expect(page.getByRole('textbox', { name: 'Sayfa başlığı' })).toHaveValue(
      'Başlıksız sayfa',
    );
    await page.getByRole('textbox', { name: 'Sayfa başlığı' }).fill('Kapsam');
    await expect(page.getByText('Kaydedildi')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Üst sayfalar' })).toContainText(
      'Ürün gereksinimleri',
    );
    await expect(tree.getByRole('button', { name: 'Kapsam', exact: true })).toBeVisible();
  });

  test('sürüm geçmişi içeriği önizler', async ({ page }) => {
    await openDocs(page);
    await page
      .getByRole('list', { name: 'Sayfa ağacı' })
      .getByRole('button', { name: 'Ürün gereksinimleri', exact: true })
      .click();
    await page.getByRole('button', { name: 'Sürümler' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sürüm geçmişi' });
    await expect(dialog.getByRole('button', { name: /Sürüm 1/ })).toBeVisible();
    await expect(dialog.getByRole('region', { name: 'Sürüm önizlemesi' })).toContainText(
      'Kullanıcılar giriş yapabilmeli.',
    );
    // Güncel sürüme geri dönülmez.
    await expect(dialog.getByRole('button', { name: 'Bu sürüme dön' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Kapat' }).first().click();
  });

  test('sayfa silinir; çöp kutusundan alt sayfalarıyla geri gelir', async ({ page }) => {
    await openDocs(page);
    const tree = page.getByRole('list', { name: 'Sayfa ağacı' });
    await page.getByRole('button', { name: 'Ürün gereksinimleri işlemleri' }).click();
    await page.getByRole('menuitem', { name: 'Sil' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByText('“Ürün gereksinimleri” çöp kutusuna taşındı.')).toBeVisible();
    await expect(page.getByText('Henüz sayfa yok.')).toBeVisible();

    await page.getByRole('button', { name: 'Çöp kutusu' }).click();
    const trash = page.getByRole('dialog', { name: 'Çöp kutusu' });
    await trash.getByRole('button', { name: 'Ürün gereksinimleri sayfasını geri getir' }).click();
    await expect(
      tree.getByRole('button', { name: 'Ürün gereksinimleri', exact: true }),
    ).toBeVisible();
    await expect(tree.getByRole('button', { name: 'Kapsam', exact: true })).toBeVisible();
  });
});
