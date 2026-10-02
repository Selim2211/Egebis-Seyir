import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 1.5 akışı: Table, süzgeç, gruplama, toplu düzenleme, `C` kısayolu, Benim işlerim, global arama. */
test.describe.serial('Görünümler ve arama', () => {
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
    await sidebar.getByRole('link', { name: 'Görünüm Testi' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
  }

  test('Space ve üç iş öğesi hazırlanır; C tuşu hızlı oluşturmaya odaklanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Görünüm Testi');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Görünüm Testi' })).toBeVisible();
    await openList(page);

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    for (const title of ['Ödeme ekranı', 'Rapor sayfası', 'Giriş hatası']) {
      await page.keyboard.press('c');
      await expect(quick).toBeFocused();
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByRole('link', { name: title })).toBeVisible();
    }
  });

  test('durum değişir, Table görünümüne geçilir, sütun başlığından sıralanır', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'GOR-2 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Devam ediyor' }).click();

    await page.getByRole('tab', { name: 'Tablo' }).click();
    await expect(page).toHaveURL(/view=table/);
    await expect(page.getByRole('columnheader', { name: 'Durum' })).toBeVisible();
    await page.getByRole('button', { name: 'Başlık', exact: true }).click();
    await expect(page).toHaveURL(/sort=title/);
    const titles = await page.getByRole('row').getByRole('link').allTextContents();
    expect(titles.slice(0, 3)).toEqual(['Giriş hatası', 'Ödeme ekranı', 'Rapor sayfası']);

    // Sütun seçimi: Etiketler sütunu açılır.
    await page.getByRole('button', { name: 'Sütunlar' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Etiketler' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: 'Etiketler' })).toBeVisible();
  });

  test('liste içi arama ve durum süzgeci adrese yazılır; gruplama başlık gösterir', async ({
    page,
  }) => {
    await openList(page);
    await page.getByRole('textbox', { name: 'Listede ara…' }).fill('rapor');
    await expect(page).toHaveURL(/q=rapor/);
    await expect(page.getByRole('link', { name: 'Rapor sayfası' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ödeme ekranı' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Temizle' }).click();
    await expect(page.getByRole('link', { name: 'Ödeme ekranı' })).toBeVisible();

    await page.getByLabel('Grupla').selectOption('status');
    await expect(page.getByRole('button', { name: /Devam ediyor/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Yapılacak/ }).first()).toBeVisible();

    // Süzgeç açıkken hızlı oluşturma kapalı.
    await page.getByRole('button', { name: 'Durum', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Devam ediyor' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Süzgeç açıkken yeni öğe eklenemez')).toBeVisible();
  });

  test('toplu düzenleme: seçili öğelerin önceliği değişir', async ({ page }) => {
    await openList(page);
    await page.getByRole('checkbox', { name: 'GOR-1 seç' }).check();
    await page.getByRole('checkbox', { name: 'GOR-3 seç' }).check();
    const bar = page.getByRole('region', { name: 'Toplu düzenleme' });
    await expect(bar).toContainText('2 öğe seçili');
    await bar.getByRole('button', { name: 'Öncelik' }).click();
    await page.getByRole('menuitem', { name: 'Acil' }).click();
    await expect(page.getByText('2 öğe güncellendi.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'GOR-1 önceliğini değiştir' }).getByRole('img'),
    ).toHaveAttribute('aria-label', 'Acil');
  });

  test('Benim işlerim: oluşturduklarım listelenir', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Bana atananlar' }).click();
    await expect(page.getByRole('heading', { name: 'Benim işlerim' })).toBeVisible();
    await page.getByRole('tab', { name: 'Oluşturduklarım' }).click();
    await expect(page).toHaveURL(/scope=created/);
    await expect(page.getByRole('link', { name: 'Ödeme ekranı' })).toBeVisible();
    await expect(page.getByText('Tarihsiz').first()).toBeVisible();
  });

  test('global arama: Ctrl+K ile açılır, başlıkla bulur, Enter sonucu açar', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Ara' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').fill('ödem');
    await expect(dialog.getByRole('option', { name: /Ödeme ekranı/ })).toBeVisible();
    await dialog.getByRole('combobox').press('Enter');
    await expect(page).toHaveURL(/\/items\/GOR-1/);
    await expect(page.getByRole('textbox', { name: 'Başlık' })).toHaveValue('Ödeme ekranı');

    // Kimlikle doğrudan bulma.
    await page.keyboard.press('/');
    await page.getByRole('dialog', { name: 'Ara' }).getByRole('combobox').fill('gor-3');
    await expect(page.getByRole('option', { name: /GOR-3/ })).toBeVisible();
  });
});
