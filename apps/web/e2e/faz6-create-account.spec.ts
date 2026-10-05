import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Yönetici, davet e-postası olmadan hesap açar; kişi hemen giriş yapabilir (ADR-092). */
test.describe.serial('Hesap oluşturma', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('yönetici hesap açar, üretilen şifreyle yeni kullanıcı giriş yapar', async ({
    page,
    browser,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/members');

    const email = `kisi${Date.now()}@example.com`;
    const form = page.getByRole('region', { name: 'Hesap oluştur' });
    await form.getByLabel('Ad soyad').fill('Veli Yılmaz');
    await form.getByLabel('E-posta').fill(email);
    await form.getByRole('button', { name: 'Hesabı oluştur' }).click();
    await expect(page.getByText(`${email} hesabı oluşturuldu.`)).toBeVisible();
    const password = (await form.getByLabel('Şifre değeri').textContent())!;
    expect(password).toHaveLength(12);

    // Yeni kullanıcı kendi tarayıcısında giriş yapar.
    const other = await browser.newContext();
    const tab = await other.newPage();
    await tab.goto('/login');
    await login(tab, email, password);
    await expect(tab.getByRole('heading', { name: /Hoş geldin, Veli/ })).toBeVisible();
    await other.close();

    // Aynı e-posta ikinci kez açılamaz.
    await form.getByLabel('Ad soyad').fill('Veli Yılmaz');
    await form.getByLabel('E-posta').fill(email);
    await form.getByRole('button', { name: 'Hesabı oluştur' }).click();
    await expect(page.getByText(/zaten/i).first()).toBeVisible();
  });
});
