import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/**
 * Sol menü (ADR-174): sabit açık (248 px) ya da yalnızca ikonlardan oluşan 66 px şerit; şeritte fare
 * üstüne gelince geçici genişler ve içeriğin ÜSTÜNE biner (içerik oynamaz). Tercih kalıcıdır.
 */
test.describe('Sol menü: daralt / sabitle', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('66 px ikon şeridi, hover ile geçici genişleme, ok ile sabitleme', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();

    const menu = page.locator('#app-sidebar');
    const main = page.locator('main');
    const width = async () => (await menu.boundingBox())!.width;
    const mainLeft = async () => (await main.boundingBox())!.x;

    // Varsayılan: menü sabit açık; içerik 248 px sağında.
    expect(await width()).toBeCloseTo(248, 0);
    expect(await mainLeft()).toBeCloseTo(248, 0);
    await page.screenshot({ path: test.info().outputPath('1-sabit-acik.png') });

    // İkonun x konumu: açıkken kaydedilir; daralınca değişmemeli (kural 4).
    const home = menu.getByRole('link', { name: 'Ana Sayfa' });
    const iconX = async () => (await home.locator('svg').first().boundingBox())!.x;
    const openIconX = await iconX();

    // Ok: daralt. Fare menüdeyken açık kalır, çekilince 66 px'e iner; içerik 66 px'te sabittir.
    await page.getByRole('button', { name: /Menüyü daralt/ }).click();
    await expect.poll(mainLeft).toBeCloseTo(66, 0);
    await page.mouse.move(900, 450);
    await expect.poll(width).toBeCloseTo(66, 0);
    expect(await iconX()).toBeCloseTo(openIconX, 0);
    // Yazılar DOM'da kalır ama görünmez (display:none değil, opacity 0).
    const label = home.locator('span').first();
    await expect(label).toHaveText('Ana Sayfa');
    expect(await label.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    expect(await label.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await page.screenshot({ path: test.info().outputPath('2-ikon-seridi.png') });

    // Menü izole ve yalnızca genişlik animasyonlu (kural 3, 6).
    const style = await menu.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        position: s.position,
        contain: s.contain,
        willChange: s.willChange,
        prop: s.transitionProperty,
      };
    });
    expect(style.position).toBe('fixed');
    // `layout paint style` tarayıcıda `content` olarak raporlanır.
    expect(style.contain).toMatch(/content|paint/);
    expect(style.willChange).toContain('width');
    expect(style.prop).toBe('width');

    // Fare şeride gelince ~70 ms sonra genişler; içerik KAYMAZ (kural 1, 2). Kareleri ölçeriz.
    await page.evaluate(() => {
      const aside = document.querySelector('#app-sidebar')!;
      const m = document.querySelector('main')!;
      const samples: Array<{ t: number; w: number; x: number }> = [];
      (window as unknown as { __samples: typeof samples }).__samples = samples;
      const start = performance.now();
      const tick = () => {
        samples.push({
          t: performance.now() - start,
          w: aside.getBoundingClientRect().width,
          x: m.getBoundingClientRect().x,
        });
        if (performance.now() - start < 900) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.mouse.move(20, 450);
    await page.waitForTimeout(1000);
    const samples = await page.evaluate(
      () =>
        (window as unknown as { __samples: Array<{ t: number; w: number; x: number }> }).__samples,
    );
    expect(
      samples.every((s) => Math.abs(s.x - 66) < 0.5),
      'içerik hover sırasında oynamadı',
    ).toBe(true);
    expect(samples.at(-1)!.w).toBeCloseTo(248, 0);
    const growing = samples.filter((s) => s.w > 66.5 && s.w < 247.5);
    expect(growing.length, 'genişleme birden çok karede aktı').toBeGreaterThanOrEqual(4);
    // Genişleme tek yönlü (geri sıçrama yok) ve geç başladı (kısa niyet bekleme).
    for (let i = 1; i < samples.length; i++)
      expect(samples[i]!.w).toBeGreaterThanOrEqual(samples[i - 1]!.w - 0.5);
    expect(samples.find((s) => s.w > 70)!.t).toBeGreaterThan(40);
    await page.screenshot({ path: test.info().outputPath('3-hover-genisledi.png') });

    // Menüdeki bağlantı genişlemişken çalışır.
    await menu.getByRole('link', { name: 'Bana atananlar' }).click();
    await expect(page).toHaveURL(/my-work/);

    // Tercih kalıcı: yenileyince hâlâ daralmış.
    await page.reload();
    await page.mouse.move(900, 450);
    await expect.poll(width).toBeCloseTo(66, 0);
    expect(await mainLeft()).toBeCloseTo(66, 0);

    // Ok: açık hâlde sabitle. İçerik tek seferde 248 px'e kayar; fare çekilse de menü açık kalır.
    await page.mouse.move(20, 450);
    await expect.poll(width).toBeCloseTo(248, 0);
    await page.getByRole('button', { name: /Menüyü açık hâlde sabitle/ }).click();
    await page.mouse.move(900, 450);
    await page.waitForTimeout(600);
    expect(await width()).toBeCloseTo(248, 0);
    expect(await mainLeft()).toBeCloseTo(248, 0);
  });
});
