import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/**
 * Yönetici isteği (ADR-107): Story Point her görevde, alt görev toplamı, yüzde, sprint özeti,
 * önceliğe göre renk, JSON dışa aktarma ve sprint bağlantısı.
 */
test.describe.serial('Story Point, yüzde ve sprint özeti', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  const openBacklog = async (page: Page) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Puan Denemesi' }).first().click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
  };

  test('Space, iki Task ve iki alt görev hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Puan Denemesi');
    await dialog.getByLabel('Anahtar').fill('PTS');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Puan Denemesi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    for (const [index, title] of ['Ana iş', 'Bağımsız iş'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`PTS-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await page.getByRole('button', { name: 'PTS-1 için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Alt öğe ekle' }).click();
    const child = page.getByPlaceholder(/Alt öğe ekle/);
    await child.fill('Alt A');
    await child.press('Enter');
    await expect(page.getByText('Alt A')).toBeVisible();
    await child.fill('Alt B');
    await child.press('Enter');
    await expect(page.getByText('Alt B')).toBeVisible();
  });

  test('Task’a 1,2,3,5,8,13,21,34,55 puanı girilir; 4 seçeneği yoktur', async ({ page }) => {
    await page.goto('/items/PTS-2');
    const points = page.getByLabel('Story Point');
    await expect(points).toBeVisible();
    const values = await points
      .locator('option')
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''),
      );
    expect(values).toEqual(['1', '2', '3', '5', '8', '13', '21', '34', '55']);
    await points.selectOption('8');
    await expect(points).toHaveValue('8');
  });

  test('alt görevlerin puanı üstte toplanır ve üst görevde elle değiştirilemez', async ({
    page,
  }) => {
    await page.goto('/items/PTS-3');
    await page.getByLabel('Story Point').selectOption('2');
    await expect(page.getByLabel('Story Point')).toHaveValue('2');
    await page.goto('/items/PTS-4');
    await page.getByLabel('Story Point').selectOption('3');
    await expect(page.getByLabel('Story Point')).toHaveValue('3');

    await page.goto('/items/PTS-1');
    await expect(page.getByLabel('Story Point')).toHaveValue('5');
    await expect(page.getByLabel('Story Point')).toBeDisabled();
    await expect(page.getByText('Alt görevlerin toplamı; alt görevlerden değişir.')).toBeVisible();
  });

  test('atanan yüzdeyi girer; kalıcıdır', async ({ page }) => {
    await page.goto('/items/PTS-2');
    const slider = page.getByRole('slider', { name: 'Tamamlanma' });
    await slider.fill('40');
    await slider.blur();
    await expect(page.getByText('40%').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('slider', { name: 'Tamamlanma' })).toHaveValue('40');

    // Alt görevi olan işte yüzde alt görevlerden gelir.
    await page.goto('/items/PTS-1');
    await expect(page.getByRole('slider', { name: 'Tamamlanma' })).toBeDisabled();
    await expect(page.getByText('Alt görevlerden hesaplanır.')).toBeVisible();
  });

  test('sprint özeti toplam puanı ve yüzdeyi gösterir; JSON indirilir; sprint bağlantısı açılır', async ({
    page,
  }) => {
    await openBacklog(page);
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const create = page.getByRole('dialog', { name: 'Yeni sprint' });
    await create.getByLabel('Ad').fill('Sprint 1');
    await create.getByRole('button', { name: 'Sprint oluştur' }).click();
    const section = page.getByRole('region', { name: 'Sprint 1' });
    await expect(section).toBeVisible();

    for (const key of ['PTS-1', 'PTS-2']) {
      await page.getByRole('button', { name: `${key} için işlemler` }).click();
      await page.getByRole('menuitem', { name: /Sprint 1 sprint/ }).click();
      await expect(
        section.getByRole('link', { name: key === 'PTS-1' ? 'Ana iş' : 'Bağımsız iş' }),
      ).toBeVisible();
    }

    await section.getByRole('button', { name: 'Sprint 1 özetini aç/kapat' }).click();
    const stats = page.getByRole('region', { name: 'Sprint 1 özeti' });
    await expect(stats).toContainText('13');
    await expect(stats).toContainText('toplam Story Point');
    await expect(stats).toContainText('Atanmamış');
    // PTS-2: 8 puan × %40 = 3,2 / 13 → %25
    await expect(
      stats.getByRole('progressbar', { name: 'Sprint tamamlanma yüzdesi' }),
    ).toHaveAttribute('aria-valuenow', '25');

    await section.getByRole('button', { name: 'Sprint 1 için işlemler' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'JSON olarak indir' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Sprint 1.json');
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      format: string;
      sprint: { id: string; url: string };
      summary: { points: number; percentDone: number };
      items: Array<{ key: string; points: number | null }>;
    };
    expect(json.format).toBe('egebis-seyir.sprint');
    expect(json.summary).toMatchObject({ points: 13, percentDone: 25 });
    expect(json.items.map((i) => i.key)).toEqual(
      expect.arrayContaining(['PTS-1', 'PTS-2', 'PTS-3', 'PTS-4']),
    );

    // Sprint bağlantısı panoyu açar.
    await page.goto(`/sprints/${json.sprint.id}`);
    await expect(page).toHaveURL(/\/board\?sprint=/);
    await expect(page.getByRole('combobox', { name: 'Sprint' })).toHaveValue(json.sprint.id);
  });

  test('menüden Kanban panosu açılır', async ({ page }) => {
    await openBacklog(page);
    const section = page.getByRole('region', { name: 'Sprint 1' });
    await section.getByRole('button', { name: 'Sprint 1 için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Kanban panosunu aç' }).click();
    await expect(page).toHaveURL(/\/board\?sprint=/);
    await expect(page.getByText('Ana iş').first()).toBeVisible();
  });

  test('önceliğe göre renklendirme açılıp kapanır', async ({ page }) => {
    await openBacklog(page);
    const toggle = page.getByRole('button', { name: 'Önceliğe göre renklendir' });
    const tinted = page.locator('[class*="border-l-priority-"]');
    await expect(tinted).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(tinted.first()).toBeVisible();
    await toggle.click();
    await expect(tinted).toHaveCount(0);
  });
});
