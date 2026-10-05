import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 6.1: kişisel API token'ı oluştur, bir kez göster, listele, iptal et. */
test.describe.serial('API erişimi', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('token oluşturulur, değeri bir kez görünür ve iptal edilir', async ({ page, request }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/api');

    await page.getByLabel('Token adı').fill('E2E betiği');
    await page.getByRole('button', { name: 'Token oluştur' }).click();
    const value = await page.getByLabel('Token değeri').textContent();
    expect(value).toMatch(/^smt_/);
    await expect(page.getByText('E2E betiği').first()).toBeVisible();

    // Bearer ile çalışır.
    const me = await request.get('/api/workspaces/00000000-0000-7000-8000-000000000000/hierarchy', {
      headers: { Authorization: `Bearer ${value}` },
    });
    expect(me.status()).toBe(404); // geçerli kimlik, üyesi olmadığı workspace

    await page.reload();
    await expect(page.getByLabel('Token değeri')).toHaveCount(0);
    await page.getByRole('button', { name: '“E2E betiği” token’ını iptal et' }).click();
    await expect(page.getByText('Token iptal edildi.')).toBeVisible();
    const after = await request.get(
      '/api/workspaces/00000000-0000-7000-8000-000000000000/hierarchy',
      {
        headers: { Authorization: `Bearer ${value}` },
      },
    );
    expect(after.status()).toBe(401);
  });
});
