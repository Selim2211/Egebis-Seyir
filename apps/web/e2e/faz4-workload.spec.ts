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

/** Faz 4.4: kişi bazlı iş yükü tablosu. */
test.describe.serial('İş yükü', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('atanan ve atanmamış açık işler kişi satırlarında toplanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Yük Testi');
    await dialog.getByLabel('Anahtar').fill('YUK');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Yük Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    for (const [index, title] of ['Birinci', 'İkinci', 'Sahipsiz'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`YUK-${index + 1} oluşturuldu.`)).toBeVisible();
    }
    sql(`
      INSERT INTO work_item_assignees ("workItemId", "userId", "workspaceId")
      SELECT w.id, u.id, w."workspaceId" FROM work_items w CROSS JOIN users u
      WHERE w."keyPrefix" = 'YUK' AND w.number IN (1, 2) AND u.email = '${OWNER.email}';
      UPDATE work_items SET "estimateHours" = 2, "dueDate" = CURRENT_DATE - 1
        WHERE "keyPrefix" = 'YUK' AND number = 1;
    `);

    await sidebar.getByRole('link', { name: 'Yük Testi' }).click();
    await sidebar.getByRole('link', { name: 'İş yükü' }).click();
    await expect(page.getByRole('heading', { name: 'İş yükü' })).toBeVisible();

    const table = page.getByRole('table', { name: 'İş yükü' });
    const mine = table.getByRole('row', { name: /Zeynep/ });
    await expect(mine.getByRole('cell').first()).toHaveText('2');
    await expect(mine).toContainText('2s');
    await expect(mine.getByRole('cell').nth(3)).toHaveText('1');
    await expect(table.getByRole('row', { name: /Atanmamış/ })).toBeVisible();
  });
});
