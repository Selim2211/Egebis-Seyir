import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 1.3 akışı: listeye iş öğesi ekle → durum/öncelik → alt öğe → Done uyarısı → sil ve geri al. */
test.describe.serial('İş öğeleri', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Space oluşturulur, listeye hızlı oluşturmayla Story ve Task eklenir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    // Önceki spec'te Space yoksa oluştur.
    if ((await sidebar.getByRole('link', { name: 'Mobil Uygulama' }).count()) === 0) {
      await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
      await dialog.getByLabel('Ad', { exact: true }).fill('Mobil Uygulama');
      await dialog.getByRole('button', { name: 'Space oluştur' }).click();
      await expect(page.getByRole('heading', { name: 'Mobil Uygulama' })).toBeVisible();
    }
    await sidebar.getByRole('link', { name: 'Mobil Uygulama' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await expect(page.getByText('Bu listede henüz iş öğesi yok')).toBeVisible();

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    await quick.fill('Giriş ekranı');
    await quick.press('Enter');
    await expect(page.getByText('MOB-1 oluşturuldu.')).toBeVisible();
    await expect(page.getByText('Giriş ekranı')).toBeVisible();

    await page.getByLabel('Tip').first().selectOption('TASK');
    await quick.fill('Form doğrulaması');
    await quick.press('Enter');
    await expect(page.getByText('MOB-2 oluşturuldu.')).toBeVisible();
  });

  test('alt öğe eklenir; durum ve öncelik satır içinde değişir', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Mobil Uygulama' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    await page.getByRole('button', { name: 'MOB-1 için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Alt öğe ekle' }).click();
    const child = page.getByPlaceholder(/Alt öğe ekle/);
    await child.fill('Validasyon mesajları');
    await child.press('Enter');
    await expect(page.getByText('Validasyon mesajları')).toBeVisible();
    await expect(page.getByRole('button', { name: 'MOB-1 alt öğelerini gizle' })).toBeVisible();

    // Durum: İlk durumdan "Devam ediyor"a.
    await page.getByRole('button', { name: 'MOB-2 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Devam ediyor' }).click();
    await expect(page.getByRole('button', { name: 'MOB-2 durumunu değiştir' })).toContainText(
      'Devam ediyor',
    );

    // Öncelik.
    await page.getByRole('button', { name: 'MOB-2 önceliğini değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Acil' }).click();
    await expect(
      page.getByRole('button', { name: 'MOB-2 önceliğini değiştir' }).getByRole('img'),
    ).toHaveAttribute('aria-label', 'Acil');
  });

  test("açık alt öğesi olan Story Done'a çekilirken uyarılır", async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Mobil Uygulama' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    await page.getByRole('button', { name: 'MOB-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Tamamlandı' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Açık alt öğeler var' });
    await expect(dialog).toContainText('1 alt öğe henüz tamamlanmadı');
    await dialog.getByRole('button', { name: 'Yine de tamamla' }).click();
    await expect(page.getByRole('button', { name: 'MOB-1 durumunu değiştir' })).toContainText(
      'Tamamlandı',
    );
  });

  test('öğe silinir, "Geri al" ile döner; çöp kutusunda listelenir', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('link', { name: 'Mobil Uygulama' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    await page.getByRole('button', { name: 'MOB-2 için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Sil' }).click();
    await expect(page.getByText('MOB-2 çöp kutusuna taşındı.')).toBeVisible();
    await expect(page.getByText('Form doğrulaması')).toHaveCount(0);

    await page.goto('/settings/archive');
    await page.getByRole('tab', { name: /Çöp kutusu/ }).click();
    await expect(page.getByText('MOB-2 Form doğrulaması')).toBeVisible();
    await page.getByRole('button', { name: 'Geri getir' }).first().click();
    await expect(page.getByText('Geri getirildi.')).toBeVisible();
  });
});
