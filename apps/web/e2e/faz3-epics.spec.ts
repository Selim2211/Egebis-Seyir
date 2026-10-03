import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { E2E } from '../playwright.config';
import { ensureOwner, login, OWNER } from './accounts';

const apiDir = fileURLToPath(new URL('../../api', import.meta.url));

function sql(statement: string): void {
  execSync('pnpm exec prisma db execute --stdin', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
    input: statement,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

/** Faz 3.1: Epic listesi ve Epic detayındaki puan/ilerleme özeti. */
test.describe.serial('Epic detayı', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('Epic ve iki Story hazırlanır; Epic’ler sekmesi ilerlemeyi gösterir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Epic Testi');
    await dialog.getByLabel('Anahtar').fill('EPC');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Epic Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    const type = page.getByLabel('Tip').first();
    await type.selectOption('EPIC');
    await quick.fill('Ödeme altyapısı');
    await quick.press('Enter');
    await expect(page.getByText('EPC-1 oluşturuldu.')).toBeVisible();
    await type.selectOption('STORY');
    for (const [index, title] of ['Kart girişi', 'Fatura'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`EPC-${index + 2} oluşturuldu.`)).toBeVisible();
    }

    // Üst öğe, puan ve durum arayüzde ayrı akışlar; bu testin konusu özet olduğu için SQL ile.
    sql(`
      UPDATE work_items SET "parentId" = (SELECT id FROM work_items WHERE "keyPrefix" = 'EPC' AND number = 1)
        WHERE "keyPrefix" = 'EPC' AND number IN (2, 3);
      UPDATE work_items SET points = 5 WHERE "keyPrefix" = 'EPC' AND number = 2;
      UPDATE work_items SET points = 3 WHERE "keyPrefix" = 'EPC' AND number = 3;
      UPDATE work_items SET "completedAt" = now(),
        "statusId" = (SELECT s.id FROM statuses s WHERE s."spaceId" = work_items."spaceId" AND s.category = 'DONE' LIMIT 1)
        WHERE "keyPrefix" = 'EPC' AND number = 2;
    `);

    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: "Epic'ler" })
      .click();
    const row = page.getByRole('listitem').filter({ hasText: 'Ödeme altyapısı' });
    await expect(row).toContainText('%63');
    await expect(row).toContainText('5 / 8 puan');
    await expect(row).toContainText('1 / 2 öğe');
    await expect(row.getByRole('progressbar', { name: 'EPC-1 ilerlemesi' })).toBeVisible();
  });

  test('Epic detayı toplam puanı ve ilerlemeyi gösterir', async ({ page }) => {
    await page.goto('/items/EPC-1');
    await expect(page.getByRole('progressbar', { name: 'İlerleme' })).toBeVisible();
    await expect(page.getByText('%63')).toBeVisible();
    await expect(page.getByText('5 / 8 puan · 1 / 2 öğe')).toBeVisible();
  });
});
