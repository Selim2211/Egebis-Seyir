import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 2.4 akışı: DoD/DoR maddeleri, Done uyarısı/zorunluluğu, Sprint Review ve demo notları. */
test.describe.serial('DoD, DoR ve Sprint Review', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  const sidebar = (page: Page) => page.getByRole('complementary');

  async function openSpace(page: Page) {
    await sidebar(page).getByRole('link', { name: 'Hazırlık Testi' }).click();
  }

  async function openList(page: Page) {
    await openSpace(page);
    await page.getByRole('link', { name: 'Görevler' }).first().click();
  }

  test('Space, DoD/DoR maddeleri ve üç Story hazırlanır', async ({ page }) => {
    await sidebar(page).getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Hazırlık Testi');
    await dialog.getByLabel('Anahtar').fill('HZR');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Hazırlık Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Space ayarları' }).click();
    await page
      .getByLabel('Definition of Ready maddeleri')
      .fill('Kabul kriteri yazıldı\nTahmin yapıldı');
    await page
      .getByLabel('Definition of Done maddeleri')
      .fill('Kod gözden geçirildi\nTestler geçti');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Değişiklikler kaydedildi.')).toBeVisible();

    await openList(page);
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    for (const [index, title] of ['Ödeme', 'Rapor', 'Kargo'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`HZR-${index + 1} oluşturuldu.`)).toBeVisible();
    }
  });

  test('öğede DoR işaretlenir; Backlog rozeti güncellenir', async ({ page }) => {
    await openSpace(page);
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await expect(backlog.getByText('DoR 0/2')).toHaveCount(3);

    await backlog.getByRole('link', { name: 'Ödeme' }).click();
    await page.getByRole('checkbox', { name: 'Kabul kriteri yazıldı' }).check();
    await page.getByRole('checkbox', { name: 'Tahmin yapıldı' }).check();
    await expect(page.getByText('2/2').first()).toBeVisible();

    await page.goto(page.url().replace(/\/items\/.*/, '') || '/');
    await openSpace(page);
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await expect(
      page.getByRole('region', { name: 'Backlog', exact: true }).getByText('DoR 0/2'),
    ).toHaveCount(2);
  });

  test('eksik DoD ile Done uyarır; DoD tamamlanınca uyarı çıkmaz', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'HZR-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Tamamlandı' }).click();
    const warn = page.getByRole('alertdialog');
    await expect(warn).toContainText('Definition of Done eksik');
    await expect(warn).toContainText('2 DoD maddesi');
    await warn.getByRole('button', { name: /Yine de tamamla/ }).click();
    await expect(page.getByRole('button', { name: 'HZR-1 durumunu değiştir' })).toContainText(
      'Tamamlandı',
    );

    // HZR-2: önce DoD işaretlenir, sonra uyarısız Done.
    await page.getByRole('link', { name: 'Rapor' }).click();
    await page.getByRole('checkbox', { name: 'Kod gözden geçirildi' }).check();
    await page.getByRole('checkbox', { name: 'Testler geçti' }).check();
    await expect(page.getByText('2/2').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'HZR-2 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Tamamlandı' }).click();
    await expect(page.getByRole('button', { name: 'HZR-2 durumunu değiştir' })).toContainText(
      'Tamamlandı',
    );
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('DoD zorunlu yapılınca eksik maddeyle Done engellenir', async ({ page }) => {
    await openSpace(page);
    await page.getByRole('link', { name: 'Space ayarları' }).click();
    await page.getByRole('switch', { name: 'Done için zorunlu' }).click();
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Değişiklikler kaydedildi.')).toBeVisible();

    await openList(page);
    await page.getByRole('button', { name: 'HZR-3 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Tamamlandı' }).click();
    await expect(page.getByText(/Definition of Done zorunlu/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'HZR-3 durumunu değiştir' })).not.toContainText(
      'Tamamlandı',
    );
  });

  test('sprint tamamlanır; Review özeti ve demo notları görünür', async ({ page }) => {
    await openSpace(page);
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const create = page.getByRole('dialog', { name: 'Yeni sprint' });
    await create.getByLabel('Sprint hedefi').fill('Ödeme akışı');
    await create.getByRole('button', { name: 'Sprint oluştur' }).click();

    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await expect(backlog.getByRole('link', { name: 'Kargo' })).toBeVisible();
    await backlog.getByRole('button', { name: /HZR-3 için işlemler/ }).click();
    await page.getByRole('menuitem', { name: "Sprint 1 sprint'ine taşı" }).click();
    const sprint = page.getByRole('region', { name: 'Sprint 1' });
    await expect(sprint.getByRole('link', { name: 'Kargo' })).toBeVisible();

    await sprint.getByRole('button', { name: 'Başlat' }).click();
    const start = page.getByRole('dialog', { name: /Sprint 1 başlatılsın mı/ });
    await expect(start).toContainText("1 öğe Definition of Ready'ye uymuyor.");
    await start.getByRole('button', { name: 'Başlat' }).click();
    await expect(page.getByText('Sprint 1 başladı.')).toBeVisible();

    await sprint.getByRole('button', { name: 'Tamamla', exact: true }).click();
    const complete = page.getByRole('dialog', { name: /Sprint 1 tamamlansın mı/ });
    await complete.getByLabel("Backlog'a gönder").check();
    await complete.getByRole('button', { name: 'Tamamla' }).click();
    await expect(page.getByText('Sprint 1 tamamlandı.')).toBeVisible();

    await page.getByRole('link', { name: 'Geçmiş', exact: true }).click();
    await page.getByRole('link', { name: 'Review' }).first().click();
    await expect(page.getByRole('heading', { name: 'Sprint 1 · Review' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tamamlanmayanlar' })).toContainText('Kargo');

    await page
      .getByRole('textbox', { name: 'Demo notları' })
      .fill('Ödeme akışı gösterildi, iade eksik.');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Notlar kaydedildi.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Demo notları' })).toHaveValue(
      'Ödeme akışı gösterildi, iade eksik.',
    );
  });
});
