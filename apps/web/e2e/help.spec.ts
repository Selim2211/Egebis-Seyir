import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Uygulama içi Yardım ve görselli kullanıcı kılavuzu. */
test.describe.serial('Yardım ve kullanıcı kılavuzu', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('üst çubuktaki Yardım düğmesi kılavuzu açar; içindekiler ve görseller çalışır', async ({
    page,
  }) => {
    await page.getByRole('link', { name: 'Yardım' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Egebis Seyir Kullanıcı Kılavuzu' }),
    ).toBeVisible();

    // Sprint, Task ve Sub-Task bölümleri içindekiler listesinde.
    const toc = page.getByRole('navigation', { name: 'İçindekiler' });
    for (const title of [
      '3. Task oluşturma',
      '4. Task düzenleme',
      '5. Sub-Task oluşturma',
      '6. Sub-Task düzenleme',
      '8. Sprint oluşturma',
      '10. Sprint düzenleme ve yönetme',
      '12. Bug’lar: açma, atama ve durum',
    ]) {
      await expect(toc.getByRole('link', { name: title })).toBeVisible();
    }

    // Bir bölüme git: görsel gerçekten yüklenir ve numaralı açıklama listesi vardır.
    await toc.getByRole('link', { name: '8. Sprint oluşturma' }).click();
    const figure = page.getByRole('figure').filter({ hasText: 'Yeni Sprint penceresi' });
    await figure.scrollIntoViewIfNeeded();
    const image = figure.getByRole('img');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(300);
    await expect(figure.getByRole('listitem')).toHaveCount(6);
  });

  test('doğrudan bölüm adresi çalışır; Word indirme bağlantısı geçerlidir', async ({
    page,
    request,
  }) => {
    await page.goto('/help?section=sprint-duzenle');
    await expect(
      page.getByRole('heading', { name: '10. Sprint düzenleme ve yönetme' }),
    ).toBeInViewport();

    const download = page.getByRole('link', { name: 'Word olarak indir' });
    await expect(download).toHaveAttribute('href', '/help/Egebis-Seyir-Kullanim-Kilavuzu.docx');
    const res = await request.get('/help/Egebis-Seyir-Kullanim-Kilavuzu.docx');
    expect(res.ok()).toBe(true);
    expect((await res.body()).subarray(0, 2).toString()).toBe('PK');
  });

  test('hesap menüsünden de açılır; dil İngilizce olunca kılavuz İngilizce olur', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Hesap menüsü/ }).click();
    await page.getByRole('menuitem', { name: 'Yardım ve kılavuz' }).click();
    await expect(page).toHaveURL(/\/help$/);

    await page.getByRole('button', { name: /Hesap menüsü/ }).click();
    await page.getByRole('menuitem', { name: 'Dil' }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Egebis Seyir User Guide' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download as Word' })).toHaveAttribute(
      'href',
      '/help/Egebis-Seyir-User-Guide.docx',
    );

    // Dili geri al (diğer testler Türkçe bekler).
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Language' }).click();
    await page.getByRole('menuitemradio', { name: 'Türkçe' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Egebis Seyir Kullanıcı Kılavuzu' }),
    ).toBeVisible();
  });
});
