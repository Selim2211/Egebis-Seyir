import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 7.8: birebir mesajlaşma: iki kullanıcı yazışır, okunmamış rozeti görünür. */
test.describe.serial('Mesajlar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('yönetici bir kullanıcıya yazar; o rozeti görür, okur ve cevap verir', async ({
    page,
    browser,
  }) => {
    // Yönetici ikinci kullanıcıyı açar.
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/members');
    const email = `mesaj${Date.now()}@example.com`;
    const form = page.getByRole('region', { name: 'Hesap oluştur' });
    await form.getByLabel('Ad soyad').fill('Deniz Arda');
    await form.getByLabel('E-posta').fill(email);
    await form.getByRole('button', { name: 'Hesabı oluştur' }).click();
    await expect(page.getByText(`${email} hesabı oluşturuldu.`)).toBeVisible();
    const password = (await form.getByLabel('Şifre değeri').textContent())!;

    // Yönetici yazar.
    await page
      .getByRole('complementary')
      .getByRole('link', { name: /^Mesajlar/ })
      .click();
    await page.getByRole('button', { name: 'Yeni mesaj' }).click();
    await page.getByLabel('Kişi seç…').selectOption({ label: 'Deniz Arda' });
    await page.getByLabel('Mesaj yaz').fill('Merhaba Deniz, raporu gördün mü?');
    await page.getByRole('button', { name: 'Gönder' }).click();
    await expect(
      page.getByRole('list', { name: 'Mesajlar' }).getByText('Merhaba Deniz, raporu gördün mü?'),
    ).toBeVisible();

    // Diğer kullanıcı okunmamış rozeti görür.
    const other = await browser.newContext();
    const tab = await other.newPage();
    await tab.goto('/login');
    await login(tab, email, password);
    await expect(tab.getByRole('heading', { name: /Hoş geldin, Deniz/ })).toBeVisible();
    const link = tab.getByRole('complementary').getByRole('link', { name: /^Mesajlar/ });
    await expect(link).toContainText('1');
    await link.click();
    await tab.getByRole('link', { name: /Zeynep Kaya/ }).click();
    await expect(
      tab.getByRole('list', { name: 'Mesajlar' }).getByText('Merhaba Deniz, raporu gördün mü?'),
    ).toBeVisible();
    await expect(link).not.toContainText('1');

    await tab.getByLabel('Mesaj yaz').fill('Evet, inceledim.');
    await tab.getByLabel('Mesaj yaz').press('Enter');
    await expect(
      tab.getByRole('list', { name: 'Mesajlar' }).getByText('Evet, inceledim.'),
    ).toBeVisible();

    // Yönetici cevabı (yoklamayla) görür.
    await expect(
      page.getByRole('list', { name: 'Mesajlar' }).getByText('Evet, inceledim.'),
    ).toBeVisible({ timeout: 15_000 });
    await other.close();
  });
});
