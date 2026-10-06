import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 6.2/6.3: webhook ekle, test gönder, teslimat günlüğünde gör. */
test.describe.serial('Webhook’lar', () => {
  let server: Server;
  let url = '';
  const received: string[] = [];

  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        received.push(`${String(req.headers['x-scrum-event'])}:${raw}`);
        res.end('ok');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/hook`;
  });
  test.afterAll(() => {
    server.close();
  });

  test('webhook eklenir; test olayı alıcıya ulaşır ve günlüğe yazılır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Webhook Testi');
    await dialog.getByLabel('Anahtar').fill('WHK');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Webhook Testi' })).toBeVisible();
    const spaceId = /spaces\/([^/?]+)/.exec(page.url())![1]!;

    await page.goto(`/spaces/${spaceId}/settings`);
    await page.getByLabel('Webhook adı').fill('Ekip kanalı');
    await page.getByLabel('Webhook adresi').fill(url);
    await page.getByRole('button', { name: 'Webhook ekle' }).click();
    await expect(page.getByLabel('İmza anahtarı')).toContainText('whsec_');

    await page.getByRole('button', { name: '“Ekip kanalı” için test gönder' }).click();
    await expect(page.getByText('Test olayı gönderildi')).toBeVisible();
    await page.getByRole('button', { name: '“Ekip kanalı” teslimat günlüğü' }).click();
    await expect(page.getByText('Gönderildi', { exact: true })).toBeVisible();
    await expect.poll(() => received.length).toBeGreaterThan(0);
    expect(received[0]).toContain('ping:');
  });
});
