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
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Doküman Testi');
    await dialog.getByLabel('Anahtar').fill('DOK');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Doküman Testi' })).toBeVisible();

    await openDocs(page);
    await expect(page.getByText('Bu Space için ilk doküman sayfasını oluştur.')).toBeVisible();
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
    await page.getByRole('button', { name: 'Tablo ekle / sil' }).click();
    await expect(body(page).locator('table')).toBeVisible();
    await expect(body(page).locator('th')).toHaveCount(3);
    await expect(page.getByText('Kaydedildi')).toBeVisible();

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
