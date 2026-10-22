import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Geçerli MP4 imzalı küçük dosya (oynatılamasa da yükleme ve arşiv akışı için yeterli). */
const fakeMp4 = () => {
  const data = Buffer.alloc(4096, 1);
  Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).copy(data);
  return data;
};

/** ADR-129: Proje başına video arşivi: klasör, yükleme, oynatıcı, başlık, taşıma, silme. */
test.describe.serial('Video arşivi', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('klasör açılır, video yüklenir, oynatıcıda başlığı değişir, klasöre taşınır ve silinir', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Video Proje');
    await dialog.getByLabel('Anahtar').fill('VID');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Video Proje' })).toBeVisible();

    await sidebar.getByRole('link', { name: 'Video arşivi' }).click();
    await expect(page.getByText('Henüz video yok.')).toBeVisible();

    // Klasör.
    await page.getByRole('button', { name: 'Yeni klasör' }).click();
    await page.getByRole('dialog').getByLabel('Klasör adı').fill('Sprint demoları');
    await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
    const folders = page.getByRole('complementary', { name: 'Klasörler' });
    await expect(folders.getByRole('button', { name: /^Sprint demoları \d+$/ })).toBeVisible();

    // Desteklenmeyen biçim reddedilir; MP4 yüklenir (seçili klasöre).
    await page.getByTestId('video-input').setInputFiles({
      name: 'film.mkv',
      mimeType: 'video/x-matroska',
      buffer: Buffer.from('x'),
    });
    await expect(page.getByText(/film\.mkv: bu biçim oynatılamaz/)).toBeVisible();
    await page.getByTestId('video-input').setInputFiles({
      name: 'Sprint 3 demo.mp4',
      mimeType: 'video/mp4',
      buffer: fakeMp4(),
    });
    await expect(page.getByText('“Sprint 3 demo” yüklendi.')).toBeVisible();
    const card = page.getByRole('button', { name: 'Sprint 3 demo videosunu oynat' });
    await expect(card).toBeVisible();
    await expect(folders.getByRole('button', { name: /^Sprint demoları \d+$/ })).toContainText('1');

    // Oynatıcı: kaynak Range destekli uç; başlık ve açıklama kaydedilir.
    await card.click();
    const player = page.getByRole('dialog');
    await expect(player).toContainText('Sprint 3 demo');
    await expect(player.getByTestId('video-player')).toHaveAttribute(
      'src',
      /\/videos\/.+\/stream$/,
    );
    const range = await page.evaluate(async () => {
      const src = document.querySelector('[data-testid="video-player"]')!.getAttribute('src')!;
      const res = await fetch(src, { headers: { Range: 'bytes=0-11' } });
      return { status: res.status, length: (await res.arrayBuffer()).byteLength };
    });
    expect(range).toEqual({ status: 206, length: 12 });
    await player.getByLabel('Başlık').fill('Sprint 3 sonuç demosu');
    await player.getByLabel('Açıklama').click();
    await expect(page.getByText('Kaydedildi.').first()).toBeVisible();
    await player.getByLabel('Klasör').selectOption({ label: 'Klasörsüz' });
    await page.keyboard.press('Escape');

    await folders.getByRole('button', { name: /^Klasörsüz \d+$/ }).click();
    await expect(
      page.getByRole('button', { name: 'Sprint 3 sonuç demosu videosunu oynat' }),
    ).toBeVisible();

    // Arama ve silme.
    await page.getByLabel('Video ara…').fill('yok böyle');
    await expect(page.getByText('Aramaya uyan video yok.')).toBeVisible();
    await page.getByLabel('Video ara…').fill('sonuç');
    await page.getByRole('button', { name: 'Sprint 3 sonuç demosu videosunu oynat' }).click();
    await page.getByRole('button', { name: 'Videoyu sil' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Videoyu sil' }).click();
    await expect(page.getByText('Video silindi.')).toBeVisible();
    await expect(page.getByText('Aramaya uyan video yok.')).toBeVisible();
  });
});
