import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 3.4: sprint retrospektifi: madde, oy, aksiyonu göreve çevirme. */
test.describe.serial('Retrospektif', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('aktif sprint için retrospektif açılır; maddeler eklenir ve oylanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Retro Testi');
    await dialog.getByLabel('Anahtar').fill('RTR');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Retro Testi' })).toBeVisible();

    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const create = page.getByRole('dialog', { name: 'Yeni sprint' });
    await create.getByLabel('Ad').fill('Sprint 1');
    await create.getByLabel('Sprint hedefi').fill('Hedef');
    await create.getByRole('button', { name: 'Sprint oluştur' }).click();
    const sprint = page.getByRole('region', { name: 'Sprint 1' });
    await sprint.getByRole('button', { name: 'Başlat' }).click();
    await page
      .getByRole('dialog', { name: /Sprint 1 başlatılsın mı/ })
      .getByRole('button', { name: 'Başlat' })
      .click();
    await expect(page.getByText('Sprint 1 başladı.')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Geçmiş' })
      .click();
    await page.getByRole('link', { name: 'Retrospektif' }).click();
    await expect(page.getByRole('heading', { name: 'Sprint 1 retrospektifi' })).toBeVisible();

    const well = page.getByRole('region', { name: 'İyi gitti' });
    await well.getByRole('textbox', { name: 'İyi gitti sütununa madde ekle' }).fill('Ekip uyumu');
    await well.getByRole('button', { name: 'Ekle' }).click();
    await expect(well.getByText('Ekip uyumu')).toBeVisible();

    const improve = page.getByRole('region', { name: 'Geliştirilmeli' });
    await improve.getByRole('textbox', { name: /madde ekle/ }).fill('Toplantılar uzun');
    await improve.getByRole('button', { name: 'Ekle' }).click();
    await improve.getByRole('button', { name: /“Toplantılar uzun” maddesine oy ver/ }).click();
    await expect(
      improve.getByRole('button', { name: /“Toplantılar uzun” maddesine oy ver/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('aksiyon göreve çevrilir ve Backlog’da görünür', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Retro Testi' }).click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Geçmiş' })
      .click();
    await page.getByRole('link', { name: 'Retrospektif' }).click();

    const actions = page.getByRole('region', { name: 'Aksiyonlar' });
    await actions.getByRole('textbox', { name: /madde ekle/ }).fill('CI süresini kısalt');
    await actions.getByRole('button', { name: 'Ekle' }).click();
    await actions.getByRole('button', { name: /aksiyonunu göreve çevir/ }).click();
    await expect(page.getByText('RTR-1 oluşturuldu; Backlog’da.')).toBeVisible();
    await expect(actions.getByRole('link', { name: /RTR-1/ })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Backlog' })
      .click();
    await expect(page.getByText('CI süresini kısalt')).toBeVisible();
  });
});
