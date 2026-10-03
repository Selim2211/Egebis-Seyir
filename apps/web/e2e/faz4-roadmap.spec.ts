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

/** Faz 4.1: Epic'lerin zaman ekseninde çubuk olarak gösterildiği Roadmap. */
test.describe.serial('Roadmap', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('tarihli Epic çubuk olur; tarihsiz Epic ayrı listelenir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Yol Haritası');
    await dialog.getByLabel('Anahtar').fill('YOL');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Yol Haritası' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('EPIC');
    for (const [index, title] of ['Ödeme altyapısı', 'Raporlama'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`YOL-${index + 1} oluşturuldu.`)).toBeVisible();
    }
    sql(`UPDATE work_items SET "startDate" = CURRENT_DATE - 10, "dueDate" = CURRENT_DATE + 40
         WHERE "keyPrefix" = 'YOL' AND number = 1;`);

    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
    await page
      .getByRole('navigation', { name: 'Scrum' })
      .getByRole('link', { name: 'Roadmap' })
      .click();

    await expect(
      page.getByRole('link', { name: /YOL-1 Ödeme altyapısı, %0 tamamlandı/ }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tarihsiz Epic’ler' })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Tarihsiz Epic’ler' })
        .getByRole('link', { name: /Raporlama/ }),
    ).toBeVisible();
  });
});
