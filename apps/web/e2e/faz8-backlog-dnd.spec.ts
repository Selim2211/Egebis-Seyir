import { expect, test, type Locator, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 8.1/8.2: sol menüde sprint ağacı, listeyi kopyalama, sprint arası sürükleme ve alt öğe yapma. */
test.describe.serial('Backlog sürükle-bırak ve sprint ağacı', () => {
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
    await page.getByRole('link', { name: 'Sürükle Denemesi' }).first().click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
  };

  /** Satırın tutamağından sürükleyip hedef konuma (dx: sağa kayma) bırakır. */
  const drag = async (page: Page, key: string, target: Locator, dx = 0) => {
    const handle = page.getByRole('button', { name: `${key} önceliğini sürükleyerek değiştir` });
    await handle.hover();
    const from = (await handle.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 60 + dx, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
  };

  test('Proje, üç Task ve iki sprint hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Sürükle Denemesi');
    await dialog.getByLabel('Anahtar').fill('DND');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Sürükle Denemesi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('TASK');
    for (const [index, title] of ['Birinci iş', 'İkinci iş', 'Üçüncü iş'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`DND-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await openBacklog(page);
    for (const name of ['Sprint 1', 'Sprint 2']) {
      await page.getByRole('button', { name: 'Sprint oluştur' }).click();
      const create = page.getByRole('dialog', { name: 'Yeni sprint' });
      await create.getByLabel('Ad').fill(name);
      await create.getByRole('button', { name: 'Sprint oluştur' }).click();
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
  });

  test('sol menüde sprint ağacı açılır ve sprintler listelenir', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sürükle Denemesi' }).first().click();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: /Backlog ve sprint'ler aç/ }).click();
    await expect(sidebar.getByRole('link', { name: /Sprint 1/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Sprint 2/ })).toBeVisible();
    await sidebar.getByRole('link', { name: /Sprint 2/ }).click();
    await expect(page).toHaveURL(/\/board\?sprint=/);
  });

  test('öğe backlog → sprint 1 → sprint 2 → backlog sürüklenir', async ({ page }) => {
    await openBacklog(page);
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    const one = page.getByRole('region', { name: 'Sprint 1' });
    const two = page.getByRole('region', { name: 'Sprint 2' });

    await drag(page, 'DND-1', one.locator('[data-drop-container]'));
    await expect(one.getByRole('link', { name: 'Birinci iş' })).toBeVisible();
    await expect(backlog.getByRole('link', { name: 'Birinci iş' })).toHaveCount(0);

    await drag(page, 'DND-1', two.locator('[data-drop-container]'));
    await expect(two.getByRole('link', { name: 'Birinci iş' })).toBeVisible();
    await expect(one.getByRole('link', { name: 'Birinci iş' })).toHaveCount(0);

    await drag(page, 'DND-1', backlog.locator('[data-drop-container]'));
    await expect(backlog.getByRole('link', { name: 'Birinci iş' })).toBeVisible();
  });

  test('satırın herhangi bir yerinden tutup başka sprint bölümüne sürüklenir (tutamaç gerekmez)', async ({
    page,
  }) => {
    await openBacklog(page);
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    const one = page.getByRole('region', { name: 'Sprint 1' });

    // Başlığın sağındaki boş yerden tut (tutamaca ya da bağlantıya basmadan).
    const row = backlog.locator('[data-drop-container] > div', { hasText: 'Birinci iş' }).first();
    const box = (await row.boundingBox())!;
    const to = (await one.locator('[data-drop-container]').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 80, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(one.getByRole('link', { name: 'Birinci iş' })).toBeVisible();
    await expect(backlog.getByRole('link', { name: 'Birinci iş' })).toHaveCount(0);

    // Geri al: aynı şekilde Backlog'a sürükle.
    const back = one.locator('[data-drop-container] > div', { hasText: 'Birinci iş' }).first();
    const b = (await back.boundingBox())!;
    const target = (await backlog.locator('[data-drop-container]').boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.62, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 80, target.y + target.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(backlog.getByRole('link', { name: 'Birinci iş' })).toBeVisible();
  });

  test('Task başka Task satırının üstüne bırakılınca onayla Sub-Task olur (Görevler listesi gibi)', async ({
    page,
  }) => {
    await openBacklog(page);
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    const target = backlog.locator('[data-row-id]', { hasText: 'İkinci iş' }).first();
    const row = backlog.locator('[data-row-id]', { hasText: 'Üçüncü iş' }).first();
    const from = (await row.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width * 0.62, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width * 0.5, to.y + to.height / 2, { steps: 15 });
    await expect(page.locator('[data-dnd-overlay]')).toContainText('Üçüncü iş');
    await expect(page.getByTestId('dnd-intent')).toHaveText(/DND-2 altına/);
    await expect(target).toHaveAttribute('data-drop-state', 'nest');
    await page.mouse.up();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sub-Task yap' }).click();
    await expect(page.getByText('DND-3 artık DND-2 öğesinin Sub-Task’ı.')).toBeVisible();
    await expect(
      backlog.locator('[data-row-id]:not([data-subtask])', { hasText: 'Üçüncü iş' }),
    ).toHaveCount(0);

    // Alt öğe Task'ın altında açılır; sürüklenince altta Ayır alanı çıkar, bırakınca Task olur.
    // Alt öğe eklenince Task'ın altı kendiliğinden açılır; öğe kaybolmuş gibi durmaz.
    await expect(backlog.locator('[data-subtask]', { hasText: 'Üçüncü iş' })).toBeVisible();
    const sub = backlog.locator('[data-subtask]', { hasText: 'Üçüncü iş' });
    const s = (await sub.boundingBox())!;
    await page.mouse.move(s.x + s.width * 0.62, s.y + s.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x + s.width * 0.62, s.y + s.height / 2 + 30, { steps: 5 });
    const zone = page.getByTestId('detach-zone');
    await expect(zone).toBeVisible();
    const z = (await zone.boundingBox())!;
    await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 15 });
    await expect(page.getByTestId('dnd-intent')).toHaveText('Ayır — bağımsız Task olur');
    await page.mouse.up();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Ayır' }).click();
    await expect(page.getByText('DND-3 artık bağımsız bir Task.')).toBeVisible();
    await expect(backlog.getByRole('link', { name: 'Üçüncü iş' })).toBeVisible();
  });

  test('sprint listesi panoya kopyalanır', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openBacklog(page);
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByRole('button', { name: 'Listeyi kopyala' }).click();
    await expect(page.getByText(/öğe panoya kopyalandı/)).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.split('\n');
    expect(lines[0]).toContain('ID\tBaşlık');
    expect(lines.some((l) => l.startsWith('DND-1\tBirinci iş'))).toBe(true);
  });

  test('görev anahtarına tıklayınca bağlantı kopyalanır ve adres görevi açar', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openBacklog(page);
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByRole('button', { name: 'DND-1 bağlantısını kopyala' }).click();
    await expect(page.getByText('Bağlantı kopyalandı.')).toBeVisible();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url.endsWith('/items/DND-1')).toBe(true);
    await page.goto(url);
    await expect(page.getByRole('textbox', { name: 'Başlık' }).first()).toHaveValue('Birinci iş');
  });
});
