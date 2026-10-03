import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { E2E } from '../playwright.config';
import { ensureOwner, login, OWNER } from './accounts';

const apiDir = fileURLToPath(new URL('../../api', import.meta.url));

/** Story Point girişi arayüzde ayrı bir akış (Faz 1 testlerinde); burada rapor ekranına odaklanmak için SQL ile. */
function setPoints(key: number, points: number): void {
  const sql = `UPDATE work_items SET points = ${points} WHERE "keyPrefix" = 'RPR' AND number = ${key};`;
  execSync('pnpm exec prisma db execute --stdin', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

/** Faz 2.6: sprint burndown ve velocity raporları. */
test.describe.serial('Raporlar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  async function openReports(page: Page) {
    await page.getByRole('complementary').getByRole('link', { name: 'Rapor Testi' }).click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Raporlar' })
      .click();
    await expect(page.getByRole('heading', { name: 'Sprint Burndown' })).toBeVisible();
  }

  test('veri yokken boş durumlar görünür', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Rapor Testi');
    await dialog.getByLabel('Anahtar').fill('RPR');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Rapor Testi' })).toBeVisible();

    await openReports(page);
    await expect(page.getByText('Burndown için başlatılmış bir sprint gerekir.')).toBeVisible();
    await expect(page.getByText(/ilk sprint kapanınca velocity görünür/)).toBeVisible();
  });

  test('aktif sprint: başlangıç ve kalan puan; biten iş kalanı düşürür', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Rapor Testi' }).click();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    for (const [index, title] of ['Giriş ekranı', 'Çıkış ekranı'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`RPR-${index + 1} oluşturuldu.`)).toBeVisible();
    }
    setPoints(1, 5);
    setPoints(2, 3);

    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const create = page.getByRole('dialog', { name: 'Yeni sprint' });
    await create.getByLabel('Ad').fill('Sprint 1');
    await create.getByLabel('Sprint hedefi').fill('Giriş akışı');
    await create.getByRole('button', { name: 'Sprint oluştur' }).click();
    const sprint = page.getByRole('region', { name: 'Sprint 1' });
    await expect(sprint).toBeVisible();

    await page.reload();
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByLabel('RPR-1 öğesini seç').check();
    await backlog.getByLabel('RPR-2 öğesini seç').check();
    await backlog.getByLabel("Sprint'e taşı…").selectOption({ label: 'Sprint 1' });
    await expect(sprint.getByText('2 öğe')).toBeVisible();
    await sprint.getByRole('button', { name: 'Başlat' }).click();
    await page
      .getByRole('dialog', { name: /Sprint 1 başlatılsın mı/ })
      .getByRole('button', { name: 'Başlat' })
      .click();
    await expect(page.getByText('Sprint 1 başladı.')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Raporlar' })
      .click();
    const stats = page.locator('dl');
    await expect(stats).toContainText(/Başlangıç puanı\s*8/);
    await expect(stats).toContainText(/Kalan puan\s*8/);
    await expect(page.getByRole('img', { name: /Sprint 1 sprint burndown grafiği/ })).toBeVisible();

    // Pano: RPR-1 biter, rapor kalan puanı 3'e indirir.
    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Sprint panosu' })
      .click();
    await page.getByRole('button', { name: 'RPR-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Tamamlandı' }).click();
    await expect(
      page.locator('[data-status-id]').last().getByRole('link', { name: 'Giriş ekranı' }),
    ).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Raporlar' })
      .click();
    await expect(page.locator('dl')).toContainText(/Başlangıç puanı\s*8/);
    await expect(page.locator('dl')).toContainText(/Kalan puan\s*3/);
  });

  test('sprint tamamlanınca velocity taahhüt ve tamamlananı gösterir', async ({ page }) => {
    await openReports(page);
    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Sprint panosu' })
      .click();
    await page.getByRole('button', { name: 'Tamamla', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Sprint 1 tamamlansın mı/ });
    await dialog.getByRole('button', { name: 'Tamamla' }).click();
    await expect(page.getByText('Sprint 1 tamamlandı.')).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Raporlar' })
      .click();
    const table = page.getByRole('table', { name: /taahhüt edilen ve tamamlanan puan/ });
    await expect(table.getByRole('row', { name: /Sprint 1\s+8\s+5/ })).toBeVisible();
    await expect(page.getByText('Son 3 sprint ortalaması: 5 puan.')).toBeVisible();
    // Tamamlanan sprint'in burndown'ı da seçilebilir kalır.
    await expect(page.getByRole('combobox', { name: 'Sprint seç' })).toContainText('Tamamlandı');
  });
});
