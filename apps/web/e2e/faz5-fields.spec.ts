import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 5.4: özel alanlar: tanımla, işte değer gir, Table'da sütun olarak göster. */
test.describe.serial('Özel alanlar', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('alan tanımlanır, işe değer girilir ve Table sütununda görünür', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Space oluştur' })
      .first()
      .click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Alan Testi');
    await dialog.getByLabel('Anahtar').fill('ALN');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Alan Testi' })).toBeVisible();
    const spaceId = /spaces\/([^/?]+)/.exec(page.url())![1]!;

    await page.getByRole('link', { name: 'Görevler' }).first().click();
    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await quick.fill('Raporu yaz');
    await quick.press('Enter');
    await expect(page.getByText('ALN-1 oluşturuldu.')).toBeVisible();
    const listUrl = page.url().split('?')[0]!;

    // Alanları tanımla: bir metin, bir liste.
    await page.goto(`/spaces/${spaceId}/settings`);
    await page.getByRole('textbox', { name: 'Yeni alan adı' }).fill('Müşteri');
    await page.getByRole('button', { name: 'Alan ekle' }).click();
    await expect(page.getByRole('textbox', { name: /^“Müşteri” alan adı$/ })).toBeVisible();

    await page.getByRole('textbox', { name: 'Yeni alan adı' }).fill('Risk');
    await page.getByLabel('Yeni alan türü').selectOption('DROPDOWN');
    await page.getByRole('textbox', { name: 'Seçenekler' }).fill('Düşük, Yüksek');
    await page.getByRole('button', { name: 'Alan ekle' }).click();
    await expect(page.getByRole('textbox', { name: /^“Risk” alan adı$/ })).toBeVisible();

    // Aynı ad reddedilir.
    await page.getByRole('textbox', { name: 'Yeni alan adı' }).fill('müşteri');
    await page.getByRole('button', { name: 'Alan ekle' }).click();
    await expect(page.getByText('Bu adla bir özel alan zaten var.')).toBeVisible();

    // İşte değer gir.
    await page.goto(`${listUrl}?item=ALN-1`);
    const panel = page.getByRole('complementary', { name: 'Özellikler' });
    const customer = panel.getByRole('textbox', { name: 'Müşteri değeri' });
    await customer.fill('Acme A.Ş.');
    await customer.press('Enter');
    await panel.getByRole('combobox', { name: 'Risk değeri' }).selectOption({ label: 'Yüksek' });
    await expect(panel.getByRole('combobox', { name: 'Risk değeri' })).toHaveValue(/.+/);

    // Yeniden yükleyince değerler kalıcı.
    await page.reload();
    await expect(
      page
        .getByRole('complementary', { name: 'Özellikler' })
        .getByRole('textbox', { name: 'Müşteri değeri' }),
    ).toHaveValue('Acme A.Ş.');

    // Table görünümünde sütun olarak seç.
    await page.goto(`${listUrl}?view=table`);
    await page.getByRole('button', { name: 'Sütunlar' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Müşteri' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Risk' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: 'Müşteri' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'Raporu yaz' });
    await expect(row.getByText('Acme A.Ş.')).toBeVisible();
    await expect(row.getByText('Yüksek')).toBeVisible();
  });
});
