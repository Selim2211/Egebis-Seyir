import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Faz 2.3 akışı: sprint başlat → kapsam değişikliği → tamamla/devret → planlama → iptal. */
test.describe.serial('Sprint yaşam döngüsü', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  async function openBacklog(page: Page) {
    await page.getByRole('complementary').getByRole('link', { name: 'Döngü Testi' }).click();
    await page.getByRole('link', { name: "Backlog ve sprint'ler" }).first().click();
  }

  async function createSprint(page: Page, name: string, goal: string) {
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yeni sprint' });
    await dialog.getByLabel('Ad').fill(name);
    await dialog.getByLabel('Sprint hedefi').fill(goal);
    await dialog.getByRole('button', { name: 'Sprint oluştur' }).click();
    await expect(page.getByRole('region', { name })).toBeVisible();
  }

  test('Space, üç Story ve iki sprint hazırlanır', async ({ page }) => {
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Space oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Space oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Döngü Testi');
    await dialog.getByLabel('Anahtar').fill('DNG');
    await dialog.getByRole('button', { name: 'Space oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Döngü Testi' })).toBeVisible();
    await page.getByRole('link', { name: 'Görevler' }).first().click();

    const quick = page.getByRole('textbox', { name: 'Başlık' });
    await page.getByLabel('Tip').first().selectOption('STORY');
    for (const [index, title] of ['Alfa', 'Beta', 'Gama'].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(page.getByText(`DNG-${index + 1} oluşturuldu.`)).toBeVisible();
    }

    await openBacklog(page);
    await createSprint(page, 'Sprint 1', 'Alfa ve Beta bitsin');
    await createSprint(page, 'Sprint 2', 'Devir sprint’i');
  });

  test('öğeler taşınıp Sprint 1 başlatılır; aktif varken ikinci sprint başlatılamaz', async ({
    page,
  }) => {
    await openBacklog(page);
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByLabel('DNG-1 öğesini seç').check();
    await backlog.getByLabel('DNG-2 öğesini seç').check();
    await backlog.getByLabel("Sprint'e taşı…").selectOption({ label: 'Sprint 1' });
    const sprint1 = page.getByRole('region', { name: 'Sprint 1' });
    await expect(sprint1.getByText('2 öğe')).toBeVisible();

    await sprint1.getByRole('button', { name: 'Başlat' }).click();
    const dialog = page.getByRole('dialog', { name: /Sprint 1 başlatılsın mı/ });
    await expect(dialog.getByText('2 öğenin tahmini yok.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Başlat' }).click();
    await expect(page.getByText('Sprint 1 başladı.')).toBeVisible();
    await expect(sprint1.getByText('Aktif', { exact: true })).toBeVisible();

    // Ikinci sprint, aktif varken başlatılamaz.
    const sprint2 = page.getByRole('region', { name: 'Sprint 2' });
    await sprint2.getByRole('button', { name: 'Başlat' }).click();
    await page
      .getByRole('dialog', { name: /Sprint 2 başlatılsın mı/ })
      .getByRole('button', { name: 'Başlat' })
      .click();
    await expect(page.getByRole('alert')).toContainText('zaten aktif bir sprint var');
    await page.keyboard.press('Escape');
  });

  test("aktif sprint'e öğe eklemek kapsam değişikliği onayı ister", async ({ page }) => {
    await openBacklog(page);
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await backlog.getByRole('button', { name: /DNG-3 için işlemler/ }).click();
    await page.getByRole('menuitem', { name: "Sprint 1 sprint'ine taşı" }).click();

    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Sprint kapsamı değişiyor');
    await confirm.getByRole('button', { name: 'Devam et' }).click();
    await expect(page.getByRole('region', { name: 'Sprint 1' }).getByText('3 öğe')).toBeVisible();
  });

  test('pano: bir öğe bitirilir; sprint tamamlanıp bitmeyenler devredilir', async ({ page }) => {
    await openBacklog(page);
    await page.getByRole('link', { name: 'Sprint panosu' }).first().click();
    await page.getByRole('button', { name: 'DNG-1 durumunu değiştir' }).click();
    await page.getByRole('menuitemradio', { name: 'Tamamlandı' }).click();
    await expect(
      page.locator('[data-status-id]').last().getByRole('link', { name: 'Alfa' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Tamamla', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Sprint 1 tamamlansın mı/ });
    await expect(dialog).toContainText('1 / 3 öğe bitti');
    await expect(dialog).toContainText('2 öğe bitmedi');
    await dialog
      .getByRole('combobox', { name: 'Sonraki sprint' })
      .selectOption({ label: 'Sprint 2' });
    await dialog.getByRole('button', { name: 'Tamamla' }).click();
    await expect(page.getByText('Sprint 1 tamamlandı.')).toBeVisible();

    // Pano sıradaki açık sprint'e geçer; kapanan sprint seçilince salt-okunur görünür.
    await page
      .getByRole('combobox', { name: 'Sprint', exact: true })
      .selectOption({ label: 'Sprint 1 · Tamamlandı' });
    await expect(page.getByText('Bu sprint tamamlandı; pano salt-okunur.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'DNG-1 durumunu değiştir' })).toHaveCount(0);
  });

  test('geçmiş sayfası sprintleri listeler; devredilenler Sprint 2’de', async ({ page }) => {
    await openBacklog(page);
    await page.getByRole('link', { name: 'Geçmiş', exact: true }).click();
    const list = page.getByRole('list').filter({ hasText: 'Sprint 1' });
    await expect(list).toContainText('Sprint 1');
    await expect(list.getByText('Tamamlandı', { exact: true })).toBeVisible();
    await expect(list).toContainText('Sprint 2');

    await page.getByRole('link', { name: 'Backlog', exact: true }).click();
    const sprint2 = page.getByRole('region', { name: 'Sprint 2' });
    await expect(sprint2.getByText('2 öğe')).toBeVisible();
    await expect(sprint2.getByRole('link', { name: 'Beta' })).toBeVisible();
  });

  test('planlama: öğe sürüklenerek sprint ile Backlog arasında taşınır; sprint iptal edilir', async ({
    page,
  }) => {
    await openBacklog(page);
    // Sprint 2'den bir öğeyi Backlog'a geri al, planlamada geri sürükle.
    await page
      .getByRole('region', { name: 'Sprint 2' })
      .getByRole('button', { name: /DNG-3 için işlemler/ })
      .click();
    await page.getByRole('menuitem', { name: "Backlog'a geri al" }).click();
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await expect(backlog.getByRole('link', { name: 'Gama' })).toBeVisible();

    await page.getByRole('link', { name: 'Planlama', exact: true }).click();
    const left = page.getByRole('region', { name: 'Backlog', exact: true });
    const right = page.getByRole('region', { name: 'Sprint 2' });
    await expect(left.getByRole('link', { name: 'Gama' })).toBeVisible();

    const card = left.getByRole('link', { name: 'Gama' });
    // Sorgu yenilenirken düğüm bir an yeniden kurulabilir; kutular hazır olana dek beklenir.
    await expect.poll(() => card.boundingBox()).not.toBeNull();
    await expect.poll(() => right.boundingBox()).not.toBeNull();
    const from = (await card.boundingBox())!;
    const to = (await right.boundingBox())!;
    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height - 20, { steps: 15 });
    await page.mouse.up();
    await expect(right.getByRole('link', { name: 'Gama' })).toBeVisible();
    await expect(left.getByRole('link', { name: 'Gama' })).toHaveCount(0);

    // Sprint 2 iptal edilir; öğeleri Backlog'a döner.
    await page.getByRole('button', { name: "Sprint 2 sprint'ini iptal et" }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'İptal et' }).click();
    await expect(page.getByText('Sprint 2 iptal edildi.')).toBeVisible();
  });

  test('sprint hedefi zorunluyken hedefsiz sprint başlamaz; Space ayarı kapatılınca uyarıyla başlar', async ({
    page,
  }) => {
    await openBacklog(page);
    await page.getByRole('button', { name: 'Sprint oluştur' }).click();
    const create = page.getByRole('dialog', { name: 'Yeni sprint' });
    await create.getByLabel('Ad').fill('Sprint 3');
    await create.getByRole('button', { name: 'Sprint oluştur' }).click();
    const sprint3 = page.getByRole('region', { name: 'Sprint 3' });
    await expect(sprint3).toBeVisible();

    await sprint3.getByRole('button', { name: 'Başlat' }).click();
    const blocked = page.getByRole('dialog', { name: /Sprint 3 başlatılsın mı/ });
    await expect(blocked.getByRole('alert')).toContainText('sprint hedefi zorunlu');
    await expect(blocked.getByRole('button', { name: 'Başlat' })).toBeDisabled();
    await page.keyboard.press('Escape');

    // Space ayarlarından zorunluluk kapatılır.
    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Döngü Testi için işlemler' })
      .click();
    await page.getByRole('menuitem', { name: 'Space ayarları' }).click();
    await page.getByRole('switch', { name: 'Sprint hedefi zorunlu' }).click();
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(page.getByText('Değişiklikler kaydedildi.')).toBeVisible();

    await openBacklog(page);
    await page
      .getByRole('region', { name: 'Sprint 3' })
      .getByRole('button', { name: 'Başlat' })
      .click();
    const warn = page.getByRole('dialog', { name: /Sprint 3 başlatılsın mı/ });
    await expect(warn).toContainText('Sprint hedefi girilmemiş.');
    await warn.getByRole('button', { name: 'Başlat' }).click();
    await expect(page.getByText('Sprint 3 başladı.')).toBeVisible();
  });
});
