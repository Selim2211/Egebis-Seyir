import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { E2E } from '../playwright.config';
import { ensureOwner, login, OWNER } from './accounts';

const apiDir = fileURLToPath(new URL('../../api', import.meta.url));

/**
 * Bildirim üretimi (kime, ne zaman, tercihler) API entegrasyon testlerinde doğrulanır. Burada
 * tarayıcı tarafı sınanır: rozet, kutu, okundu işaretleme, gezinme ve tercih ekranı. Başka kullanıcı
 * gerektirmesin diye (davet e-postası ister) bildirimler veritabanına doğrudan eklenir.
 */
function seedNotifications(): void {
  const sql = `
    INSERT INTO notifications (id, "workspaceId", "userId", "actorId", type, "spaceId", "workItemId", data)
    SELECT gen_random_uuid(), w."workspaceId", u.id, NULL, t.type::"NotificationType", w."spaceId", w.id,
           jsonb_build_object('actorName', 'Elif Demir', 'itemKey', 'BLD-1', 'itemTitle', w.title)
    FROM work_items w
    CROSS JOIN users u
    CROSS JOIN (VALUES ('ASSIGNED'), ('COMMENTED')) AS t(type)
    WHERE w."keyPrefix" = 'BLD' AND w.number = 1 AND u.email = '${OWNER.email}';
  `;
  execSync('pnpm exec prisma db execute --stdin', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

test.describe.serial('Bildirimler', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('boş kutu: rozet yok, boş durum görünür', async ({ page }) => {
    await page
      .getByRole('complementary')
      .getByRole('link', { name: /Bildirimler/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
    await expect(page.getByText('Henüz bildirim yok.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tümünü okundu yap' })).toBeDisabled();
  });

  test('bildirimler rozeti artırır; tıklayınca okundu olur ve öğeye gider', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Bildirim Testi');
    await dialog.getByLabel('Anahtar').fill('BLD');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Bildirim Testi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Rapor ekranı');
    await quick.press('Enter');
    await expect(page.getByText('BLD-1 oluşturuldu.')).toBeVisible();

    seedNotifications();
    await page.reload();
    // Rozet 30 sn'lik yoklamayı beklemeden sayfa yenilenince gelir.
    await expect(page.getByRole('link', { name: 'Bildirimler, 2 okunmamış' })).toBeVisible();

    await page.getByRole('link', { name: 'Bildirimler, 2 okunmamış' }).click();
    await expect(page.getByRole('button', { name: /sana BLD-1 görevini atadı/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /BLD-1 görevine yorum yazdı/ })).toBeVisible();
    await page.getByRole('tab', { name: /Okunmamış/ }).click();
    await expect(page.getByRole('button', { name: /görevi/ })).toHaveCount(2);

    await page.getByRole('button', { name: /sana BLD-1 görevini atadı/ }).click();
    await expect(page).toHaveURL(/\/items\/BLD-1/);

    await page.getByRole('link', { name: 'Bildirimler, 1 okunmamış' }).click();
    await page.getByRole('button', { name: 'Tümünü okundu yap' }).click();
    await expect(
      page.getByRole('link', { name: 'Bildirimler', exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('tab', { name: /Okunmamış/ }).click();
    await expect(page.getByText('Okunmamış bildirim yok.')).toBeVisible();
    await page.getByRole('tab', { name: 'Tümü' }).click();
    await expect(page.getByRole('button', { name: /görevi/ })).toHaveCount(2);
  });

  test('tercih ekranı: anahtarlar kaydedilir ve yenilemeden sonra korunur', async ({ page }) => {
    await page.goto('/settings/notifications');
    const email = page.getByRole('switch', { name: 'Yorum geldi — E-posta' });
    const inApp = page.getByRole('switch', { name: 'Bana atandı — Uygulama içi' });
    await expect(email).toBeChecked();
    await expect(inApp).toBeChecked();

    await email.click();
    await expect(page.getByText('Bildirim tercihleri kaydedildi.')).toBeVisible();
    await inApp.click();
    await expect(inApp).not.toBeChecked();

    await page.reload();
    await expect(page.getByRole('switch', { name: 'Yorum geldi — E-posta' })).not.toBeChecked();
    await expect(
      page.getByRole('switch', { name: 'Bana atandı — Uygulama içi' }),
    ).not.toBeChecked();
    // Dokunulmayanlar açık kalır.
    await expect(page.getByRole('switch', { name: 'Yorum geldi — Uygulama içi' })).toBeChecked();
  });
});
