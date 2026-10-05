import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 6.4: Git entegrasyonu: oluştur, imzalı push gönder, işte "Geliştirme" bölümünde gör. */
test.describe.serial('Git entegrasyonu', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('commit anahtarı geçen işe bağlanır', async ({ page, request }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Git Testi');
    await dialog.getByLabel('Anahtar').fill('GTT');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Git Testi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Giriş sayfası');
    await quick.press('Enter');
    await expect(page.getByText('GTT-1 oluşturuldu.')).toBeVisible();
    const listUrl = page.url().split('?')[0]!;

    await page.goto('/settings/integrations');
    await page.getByLabel('Ad', { exact: true }).fill('acme/app');
    await page.getByRole('button', { name: 'Entegrasyon oluştur' }).click();
    const url = (await page.getByLabel('Webhook adresi').textContent())!;
    const secret = (await page.getByLabel('Gizli anahtar').textContent())!;
    expect(url).toContain('/api/integrations/git/');

    const raw = JSON.stringify({
      repository: { full_name: 'acme/app' },
      commits: [
        {
          id: 'abc1234def',
          message: 'GTT-1 giriş formu eklendi',
          url: 'https://example.com/c/1',
          author: { name: 'Elif' },
        },
      ],
    });
    const res = await request.post(new URL(url).pathname, {
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'push',
        'X-Hub-Signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
      },
      data: raw,
    });
    expect(res.status()).toBe(202);

    await page.goto(`${listUrl}?item=GTT-1`);
    await expect(page.getByRole('link', { name: 'GTT-1 giriş formu eklendi' })).toBeVisible();
    await expect(page.getByText('acme/app')).toBeVisible();
  });
});
