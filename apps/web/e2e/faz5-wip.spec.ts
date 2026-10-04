import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 5.2: WIP limiti. Ayarlardan konur, Board sütununda sayaç olarak görünür; engellemez. */
test.describe.serial('WIP limiti', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('sınır aşılınca Board sütunu uyarır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('WIP Testi');
    await dialog.getByLabel('Anahtar').fill('WIP');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'WIP Testi' })).toBeVisible();
    const spaceId = /spaces\/([^/?]+)/.exec(page.url())![1]!;

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    for (const [index, title] of ['Birinci', 'İkinci'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`WIP-${index + 1} oluşturuldu.`)).toBeVisible();
    }
    const listUrl = page.url().split('?')[0]!;

    await page.goto(`/spaces/${spaceId}/settings`);
    const limit = page.getByRole('spinbutton', { name: '“Backlog” WIP limiti' });
    await limit.fill('1');
    await limit.press('Enter');
    await page.reload();
    await expect(page.getByRole('spinbutton', { name: '“Backlog” WIP limiti' })).toHaveValue('1');

    await page.goto(`${listUrl}?view=board`);
    const counter = page.locator('[data-wip]').first();
    await expect(counter).toHaveText('2 / 1');
    await expect(counter).toHaveAttribute('data-wip', 'over');
  });
});
