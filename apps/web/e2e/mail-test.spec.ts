import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-119/120: Ayarlar → Genel'de SMTP bilgisi uygulamadan girilir, kaydedilir ve denenir. */
test('E-posta ayarı uygulamadan kaydedilir ve denenir', async ({ page, request }) => {
  await ensureOwner(request);
  await page.goto('/login');
  await login(page, OWNER.email, OWNER.password);
  await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

  await page.goto('/settings/general');
  const section = page.getByRole('region', { name: 'E-posta gönderimi' });
  await expect(section).toBeVisible();

  await section.getByLabel('SMTP sunucusu').fill('smtp.gmail.com');
  await section.getByLabel('Port').fill('587');
  await section.getByLabel('Kullanıcı adı').fill('egebisseyir@gmail.com');
  await section.getByLabel('Şifre').fill('abcd efgh ijkl mnop');
  await section.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('E-posta ayarı kaydedildi.')).toBeVisible();

  // Şifre bir daha gösterilmez; kayıtlı olduğu belirtilir ve alan boşalır.
  await page.reload();
  await expect(section.getByLabel('SMTP sunucusu')).toHaveValue('smtp.gmail.com');
  await expect(section.getByLabel('Şifre')).toHaveValue('');
  await expect(section.getByLabel('Şifre')).toHaveAttribute('placeholder', /Kayıtlı/);

  // Test: ortama göre (bellek/Mailpit/gerçek sunucu) başarı ya da açıklayıcı hata çıkar.
  await section.getByTestId('mail-test-button').click();
  const ok = page.getByTestId('mail-test-ok');
  const error = page.getByTestId('mail-test-error');
  await expect(ok.or(error)).toBeVisible({ timeout: 40_000 });
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mail-settings.png', fullPage: true });

  // Sunucu ayarına dön: kayıt silinir.
  await section.getByRole('button', { name: 'Sunucu ayarına dön' }).click();
  await expect(page.getByText(/Kayıtlı ayar silindi/)).toBeVisible();
});

/** ADR-122: e-postalardaki bağlantı adresi uygulamadan girilir; yanlışsa uyarır ve tek tıkla düzeltir. */
test('Uygulama adresi kaydedilir; tarayıcıdaki adresten farklıysa uyarır', async ({
  page,
  request,
}) => {
  await ensureOwner(request);
  await page.goto('/login');
  await login(page, OWNER.email, OWNER.password);
  await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

  await page.goto('/settings/general');
  const section = page.getByRole('region', { name: 'Uygulama adresi' });
  await expect(section).toBeVisible();

  await section.getByLabel('Adres').fill('https://seyir.firma.com/');
  await section.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Uygulama adresi kaydedildi.')).toBeVisible();

  // Kaydedilen adres tarayıcıdakinden farklı: uyarı çıkar, düğme tarayıcıdaki adresi önerir.
  await page.reload();
  await expect(section.getByLabel('Adres')).toHaveValue('https://seyir.firma.com');
  const warning = section.getByTestId('app-url-warning');
  await expect(warning).toContainText('yanlış adrese');
  await warning.getByRole('button', { name: /adresini kullan/ }).click();
  await expect(section.getByLabel('Adres')).toHaveValue(new URL(page.url()).origin);
  await section.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Uygulama adresi kaydedildi.')).toBeVisible();
  await expect(warning).toHaveCount(0);

  // Sunucu ayarına dön: kayıt silinir.
  await section.getByRole('button', { name: 'Sunucu ayarına dön' }).click();
  await expect(page.getByText(/Kayıtlı adres silindi/)).toBeVisible();
});
