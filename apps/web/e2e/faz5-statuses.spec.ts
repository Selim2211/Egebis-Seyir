import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 5.3: özel durum akışı: durum ekle, yeniden adlandır, sırala, sil (işler taşınır). */
test.describe.serial('Özel durum akışı', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('durum eklenir, adlandırılır ve silinince işler taşınır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Akış Testi');
    await dialog.getByLabel('Anahtar').fill('AKS');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Akış Testi' })).toBeVisible();
    const spaceId = /spaces\/([^/?]+)/.exec(page.url())![1]!;

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await page.getByRole('textbox', { name: 'Başlık' }).fill('Taşınacak iş');
    await page.getByRole('textbox', { name: 'Başlık' }).press('Enter');
    await expect(page.getByText('AKS-1 oluşturuldu.')).toBeVisible();
    const listUrl = page.url().split('?')[0]!;

    // Yeni durum ekle: "Test" (Devam ediyor), son açık durumun arkasına girer.
    await page.goto(`/spaces/${spaceId}/settings`);
    await page.getByRole('textbox', { name: 'Yeni durum adı' }).fill('Test');
    await page.getByRole('button', { name: 'Durum ekle' }).click();
    const name = page.getByRole('textbox', { name: /^“Test” adı$/ });
    await expect(name).toBeVisible();

    // Yeniden adlandır.
    await name.fill('QA');
    await name.press('Enter');
    await expect(page.getByRole('textbox', { name: /^“QA” adı$/ })).toBeVisible();

    // Aynı ad reddedilir.
    await page.getByRole('textbox', { name: 'Yeni durum adı' }).fill('qa');
    await page.getByRole('button', { name: 'Durum ekle' }).click();
    await expect(page.getByText('Bu adla bir durum zaten var.')).toBeVisible();

    // Board'da yeni sütun görünür.
    await page.goto(`${listUrl}?view=board`);
    await expect(page.getByRole('heading', { name: 'QA' })).toBeVisible();

    // Backlog durumunu sil: iş "Yapılacak"a taşınır.
    await page.goto(`/spaces/${spaceId}/settings`);
    await page.getByRole('button', { name: '“Backlog” durumunu sil' }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.getByLabel('İşlerin taşınacağı durum').selectOption({ label: 'Yapılacak' });
    await confirm.getByRole('button', { name: 'Sil ve işleri taşı' }).click();
    await expect(page.getByRole('textbox', { name: /^“Backlog” adı$/ })).toHaveCount(0);

    await page.goto(`${listUrl}?view=board`);
    await expect(page.getByRole('heading', { name: 'Backlog' })).toHaveCount(0);
    await expect(page.getByText('Taşınacak iş')).toBeVisible();
  });
});
