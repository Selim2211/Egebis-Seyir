import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-119: Ayarlar → Genel'deki "Test e-postası gönder" sonucu ekranda gösterir (başarı ya da hata nedeni). */
test('Test e-postası düğmesi sonucu gösterir', async ({ page, request }) => {
  await ensureOwner(request);
  await page.goto('/login');
  await login(page, OWNER.email, OWNER.password);
  await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

  await page.goto('/settings/general');
  await expect(page.getByRole('heading', { name: 'E-posta gönderimi' })).toBeVisible();
  await page.getByTestId('mail-test-button').click();

  // Ortama göre posta sunucusu açık ya da kapalı olabilir; ikisinde de açıklayıcı bir sonuç çıkar.
  const ok = page.getByTestId('mail-test-ok');
  const error = page.getByTestId('mail-test-error');
  await expect(ok.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) {
    await expect(error).toContainText('E-posta gönderilemedi.');
    await expect(error).toContainText('Hata kodu');
  } else {
    await expect(ok).toContainText(OWNER.email);
  }
  await page.getByRole('heading', { name: 'E-posta gönderimi' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mail-test.png', fullPage: true });
});
