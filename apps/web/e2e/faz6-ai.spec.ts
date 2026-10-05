import { createServer, type Server } from 'node:http';
import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 6.5: yapay zekâ önerileri (sahte model sunucusuyla): öner, onayla, uygula. */
test.describe.serial('Yapay zekâ önerileri', () => {
  let fake: Server;

  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
    fake = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: '{"description":"Bir kullanıcı olarak sepete ürün eklemek istiyorum.","acceptanceCriteria":["Ürün sepete eklenir","Stok yoksa uyarı çıkar"]}',
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) => fake.listen(3199, '127.0.0.1', resolve));
  });
  test.afterAll(() => {
    fake.close();
  });

  test('hikâye önerisi kabul kriteri listesi olarak eklenir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('YZ Testi');
    await dialog.getByLabel('Anahtar').fill('YZT');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'YZ Testi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();
    await page.getByLabel('Tip').first().selectOption('STORY');
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Sepete ürün ekle');
    await quick.press('Enter');
    await expect(page.getByText('YZT-1 oluşturuldu.')).toBeVisible();
    const listUrl = page.url().split('?')[0]!;

    await page.goto(`${listUrl}?item=YZT-1`);
    await page.getByRole('button', { name: 'Yapay zekâ', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Hikâye ve kabul kriteri öner' }).click();
    const result = page.getByRole('region', { name: 'Yapay zekâ önerisi' });
    await expect(result.getByText('Stok yoksa uyarı çıkar')).toBeVisible();

    await result.getByRole('button', { name: 'Kabul kriterleri listesi olarak ekle' }).click();
    await expect(result.getByRole('button', { name: 'Eklendi' }).last()).toBeVisible();
    await page.reload();
    await expect(page.getByText('Ürün sepete eklenir')).toBeVisible();
  });
});
