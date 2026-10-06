import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 7.1: tekrarlayan görev: kural kur, tamamla, bir sonraki örnek oluşsun. */
test.describe.serial('Tekrarlayan görev', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('haftalık tekrar kurulur; görev tamamlanınca bir sonraki hafta için yenisi doğar', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Tekrar Testi');
    await dialog.getByLabel('Anahtar').fill('TKR');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Tekrar Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Haftalık toplantı notu');
    await quick.press('Enter');
    await expect(page.getByText('TKR-1 oluşturuldu.')).toBeVisible();

    await page.getByRole('link', { name: 'Haftalık toplantı notu' }).click();
    const panel = page.getByRole('dialog');

    // Bitiş tarihi olmadan tekrar seçilemez.
    await expect(panel.getByLabel('Tekrar', { exact: true })).toBeDisabled();
    await expect(panel.getByText('Tekrar için önce bitiş tarihi seç.')).toBeVisible();

    await panel.getByLabel('Bitiş').fill('2030-03-04');
    await expect(panel.getByLabel('Tekrar', { exact: true })).toBeEnabled();
    await panel.getByLabel('Tekrar', { exact: true }).selectOption('WEEKLY');
    await expect(
      panel.getByText('Görev tamamlanınca bir sonraki örnek otomatik oluşur.'),
    ).toBeVisible();

    // Tamamla.
    await page.getByRole('button', { name: 'TKR-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Tamamlandı' }).click();
    await page.keyboard.press('Escape');

    // Yeni örnek listede doğar ve bir hafta sonrasını gösterir.
    await page.goto(page.url().split('?')[0]!);
    await expect(page.getByText('TKR-2')).toBeVisible();
    await page.getByRole('link', { name: 'Haftalık toplantı notu' }).last().click();
    await expect(page.getByRole('dialog').getByLabel('Bitiş')).toHaveValue('2030-03-11');
    await expect(page.getByRole('dialog').getByLabel('Tekrar', { exact: true })).toHaveValue(
      'WEEKLY',
    );
  });
});
