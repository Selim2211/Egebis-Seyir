import { expect, type Page, test } from '@playwright/test';
import { login, MEMBER, OWNER } from './accounts';
import { waitForMail } from './mailpit';

async function logout(page: Page) {
  await page.getByRole('button', { name: /Hesap menüsü/ }).click();
  await page.getByRole('menuitem', { name: 'Çıkış yap' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Faz 1.1 akışı: kurulum → davet → e-postadan kayıt → giriş (taslak 1, 6, 9). */
test.describe.serial('Kimlik, workspace ve davet', () => {
  test('ilk açılışta kurulum ekranı gelir ve Owner oluşturulur', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup$/);

    await page.getByLabel('Kurum / workspace adı').fill('E2E Kurumu');
    await page.getByLabel('Ad soyad').fill(OWNER.name);
    await page.getByLabel('E-posta').fill(OWNER.email);
    await page.getByLabel('Şifre').fill(OWNER.password);
    await page.getByRole('button', { name: 'Kurulumu tamamla' }).click();

    await expect(page.getByRole('heading', { name: 'Hoş geldin, Zeynep' })).toBeVisible();
    await expect(page.getByText('E2E Kurumu')).toBeVisible();

    // Kurulum bir kez yapılır.
    await page.goto('/setup');
    await expect(page).not.toHaveURL(/\/setup/);
  });

  test('Owner üye davet eder; davet e-postası gelir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await page.getByRole('link', { name: 'Takımını davet et' }).click();

    await page.getByLabel('E-posta ile davet et').fill(MEMBER.email);
    await page.getByRole('button', { name: 'Davet gönder' }).click();
    await expect(page.getByText('Davet gönderildi.')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Bekleyen davetler' }).getByText(MEMBER.email),
    ).toBeVisible();

    const mail = await waitForMail(MEMBER.email);
    expect(mail.subject).toBe('E2E Kurumu çalışma alanına davet edildin');
    expect(mail.text).toContain('Member olarak davet etti');
  });

  test('davet bağlantısıyla hesap açılır; Member davet edemez', async ({ page }) => {
    const { text } = await waitForMail(MEMBER.email);
    const link = /https?:\/\/\S+\/invite\/\S+/.exec(text)?.[0];
    expect(link).toBeDefined();

    await page.goto(link!);
    await expect(
      page.getByRole('heading', { name: "E2E Kurumu workspace'ine katıl" }),
    ).toBeVisible();
    await expect(page.getByLabel('E-posta')).toHaveValue(MEMBER.email);
    await page.getByLabel('Ad soyad').fill(MEMBER.name);
    await page.getByLabel('Şifre').fill(MEMBER.password);
    await page.getByRole('button', { name: 'Hesabı oluştur ve katıl' }).click();

    await expect(page.getByRole('heading', { name: 'Hoş geldin, Elif' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Üye davet et' })).toHaveCount(0);

    await page.goto('/settings/members');
    await expect(page.getByText('2 üye')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Davet gönder' })).toHaveCount(0);

    // Bağlantı tek kullanımlık.
    await logout(page);
    await page.goto(link!);
    await expect(page.getByRole('heading', { name: 'Davet geçersiz' })).toBeVisible();
  });

  test('yanlış şifre hata verir; doğru şifreyle giriş yapılır', async ({ page }) => {
    await page.goto('/login');
    await login(page, MEMBER.email, 'yanlis-sifre');
    await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.');

    await page.getByLabel('Şifre').fill(MEMBER.password);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('heading', { name: 'Hoş geldin, Elif' })).toBeVisible();
  });

  test('korumalı sayfa oturumsuz açılınca giriş sonrası geri döner', async ({ page }) => {
    await page.goto('/settings/sessions');
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await login(page, OWNER.email, OWNER.password);
    await expect(page).toHaveURL(/\/settings\/sessions$/);
    await expect(page.getByText('Bu cihaz')).toBeVisible();
  });

  test('dil ve tema kullanıcı menüsünden değişir ve hesaba kaydedilir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);

    await page.getByRole('button', { name: /Hesap menüsü/ }).click();
    await page.getByRole('menuitem', { name: 'Tema' }).click();
    await page.getByRole('menuitemradio', { name: 'Koyu' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByRole('button', { name: /Hesap menüsü/ }).click();
    await page.getByRole('menuitem', { name: 'Dil' }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Zeynep' })).toBeVisible();

    // Başka bir tarayıcı bağlamında (cihaz) aynı hesapla giriş: tercihler hesaptan gelir.
    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto('/login');
    await login(otherPage, OWNER.email, OWNER.password);
    await expect(otherPage.getByRole('heading', { name: 'Welcome, Zeynep' })).toBeVisible();
    await expect(otherPage.locator('html')).toHaveClass(/dark/);
    await other.close();
  });

  test('bilinmeyen adres 404 gösterir', async ({ page }) => {
    await page.goto('/olmayan-sayfa');
    await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible();
  });
});
