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

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/** Faz 4.2: List takvim görünümü: öğeler tarih günlerinde, sürükleyince tarih kayar. */
test.describe.serial('Takvim görünümü', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('bitiş tarihli öğe günde görünür; başka güne sürüklenince tarihi değişir', async ({
    page,
  }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Takvim Testi');
    await dialog.getByLabel('Anahtar').fill('TKV');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Takvim Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    for (const [index, title] of ['Sunum hazırla', 'Tarihsiz iş'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`TKV-${index + 1} oluşturuldu.`)).toBeVisible();
    }
    sql(`UPDATE work_items SET "dueDate" = date_trunc('month', now())::date + 9
         WHERE "keyPrefix" = 'TKV' AND number = 1;`);

    await page.reload();
    await page.getByRole('tab', { name: 'Takvim' }).click();
    const tenth = page.locator(`[data-day="${month}-10"]`);
    await expect(tenth.getByText('Sunum hazırla')).toBeVisible();
    await expect(
      page.getByRole('region', { name: /Tarihsiz öğeler/ }).getByText('Tarihsiz iş'),
    ).toBeVisible();

    const chip = tenth.getByText('Sunum hazırla');
    const target = page.locator(`[data-day="${month}-12"]`);
    const from = (await chip.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + 8, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 30, to.y + 30, { steps: 12 });
    await page.mouse.up();

    await expect(target.getByText('Sunum hazırla')).toBeVisible();
    await expect(tenth.getByText('Sunum hazırla')).toHaveCount(0);

    await page.reload();
    await expect(page.locator(`[data-day="${month}-12"]`).getByText('Sunum hazırla')).toBeVisible();
  });
});
