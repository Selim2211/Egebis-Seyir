import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 5.6: otomasyonlar: kural tanımla, olay tetikler, çalışma günlüğü görünür. */
test.describe.serial('Otomasyonlar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('duruma geçince önceliği yükselten kural çalışır ve günlüğe yazılır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Otomasyon Testi');
    await dialog.getByLabel('Anahtar').fill('OTM');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Otomasyon Testi' })).toBeVisible();
    const spaceId = /spaces\/([^/?]+)/.exec(page.url())![1]!;

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Müşteri şikayeti');
    await quick.press('Enter');
    await expect(page.getByText('OTM-1 oluşturuldu.')).toBeVisible();
    const listUrl = page.url().split('?')[0]!;

    // Kural: "İncelemede" durumuna geçince öncelik Yüksek olsun.
    await page.goto(`/spaces/${spaceId}/settings`);
    await page.getByRole('button', { name: 'Otomasyon ekle' }).click();
    const form = page.getByRole('dialog', { name: 'Yeni otomasyon' });
    await form.getByLabel('Ad', { exact: true }).fill('İnceleme önceliği');
    await form.getByLabel('Yeni durum').selectOption({ label: 'İncelemede' });
    await form.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Otomasyon kaydedildi.')).toBeVisible();
    await expect(page.getByText('İnceleme önceliği')).toBeVisible();

    // Öğeyi İncelemede'ye çek.
    await page.goto(listUrl);
    await page.getByRole('button', { name: 'OTM-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'İncelemede' }).click();
    await expect(page.getByRole('button', { name: 'OTM-1 önceliğini değiştir' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'OTM-1 önceliğini değiştir' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Yüksek' })).toBeChecked();
    await page.keyboard.press('Escape');

    // Çalışma günlüğü.
    await page.goto(`/spaces/${spaceId}/settings`);
    await page.getByRole('button', { name: '“İnceleme önceliği” çalışma günlüğü' }).click();
    await expect(page.getByText('Çalıştı')).toBeVisible();
    await expect(page.getByText('OTM-1', { exact: true })).toBeVisible();
  });
});
