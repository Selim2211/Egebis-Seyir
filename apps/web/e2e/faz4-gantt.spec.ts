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

/** Faz 4.5: Gantt: çubuklar, bağımlılık okları, kritik yol ve sürükleyerek tarih kaydırma. */
test.describe.serial('Gantt', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('bağımlı işler okla bağlanır ve kritik yol işaretlenir', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Gantt Testi');
    await dialog.getByLabel('Anahtar').fill('GNT');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Gantt Testi' })).toBeVisible();

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    for (const [index, title] of ['Tasarım', 'Geliştirme', 'Yayın'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`GNT-${index + 1} oluşturuldu.`)).toBeVisible();
    }
    sql(`
      UPDATE work_items SET "startDate" = CURRENT_DATE, "dueDate" = CURRENT_DATE + 4
        WHERE "keyPrefix" = 'GNT' AND number = 1;
      UPDATE work_items SET "startDate" = CURRENT_DATE + 5, "dueDate" = CURRENT_DATE + 12
        WHERE "keyPrefix" = 'GNT' AND number = 2;
      UPDATE work_items SET "startDate" = CURRENT_DATE + 10, "dueDate" = CURRENT_DATE + 14
        WHERE "keyPrefix" = 'GNT' AND number = 3;
      INSERT INTO work_item_links (id, "workspaceId", "fromId", "toId", type)
      SELECT gen_random_uuid(), a."workspaceId", a.id, b.id, 'BLOCKS'
      FROM work_items a JOIN work_items b ON b."keyPrefix" = 'GNT' AND b.number = a.number + 1
      WHERE a."keyPrefix" = 'GNT' AND a.number IN (1, 2);
    `);

    await sidebar.getByRole('link', { name: 'Gantt Testi' }).click();
    await sidebar.getByRole('link', { name: 'Gantt', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Gantt', exact: true })).toBeVisible();

    await expect(page.getByText('Kritik yol: 18 gün, 3 iş')).toBeVisible();
    await expect(page.locator('[data-dependency]')).toHaveCount(2);
    // GNT-3, GNT-2 bitmeden başlıyor (gün 10 < gün 12): çakışma uyarısı.
    await expect(
      page.getByRole('status').filter({ hasText: '1 bağımlılıkta çakışma' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /GNT-1 Tasarım.*kritik yolda/ })).toBeVisible();
  });

  test('çubuğu sürüklemek tarihleri kaydırır', async ({ page }) => {
    await page.getByRole('complementary').getByRole('link', { name: 'Gantt Testi' }).click();
    await page.getByRole('complementary').getByRole('link', { name: 'Gantt', exact: true }).click();

    const bar = page.getByRole('img', { name: /GNT-3 Yayın/ });
    const before = await bar.getAttribute('aria-label');
    const box = (await bar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(async () => page.getByRole('img', { name: /GNT-3 Yayın/ }).getAttribute('aria-label'))
      .not.toBe(before);
    await page.reload();
    await expect
      .poll(async () => page.getByRole('img', { name: /GNT-3 Yayın/ }).getAttribute('aria-label'))
      .not.toBe(before);
  });
});
