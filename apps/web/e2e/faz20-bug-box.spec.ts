import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-140: Bug Kutusu (sayfalama, sıralama, arama) ve E-posta ayarları (firma, kural). */
test.describe.serial('Bug Kutusu ve E-posta ayarları', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  const call = <T>(page: Page, method: string, path: string, body?: unknown) =>
    page.evaluate(
      async ({ method, path, body }) => {
        const csrf =
          document.cookie
            .split('; ')
            .find((c) => c.startsWith('sm_csrf='))
            ?.split('=')[1] ?? '';
        const res = await fetch('/api' + path, {
          method,
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return (res.status === 204 ? null : await res.json()) as T;
      },
      { method, path, body },
    );

  test('Bug Kutusu 20’şerli sayfalar, sıralar ve arar; ayarlardan firma ve kural eklenir', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Kutu Proje');
    await dialog.getByLabel('Anahtar').fill('KUT');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Kutu Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    const ws = me.workspaces[0]!.id;
    const tree = await call<{ spaces: Array<{ key: string; id: string }> }>(
      page,
      'GET',
      `/workspaces/${ws}/hierarchy`,
    );
    const space = tree.spaces.find((s) => s.key === 'KUT')!;
    // 21 Bug: ikinci sayfada tek kayıt kalır.
    for (let i = 1; i <= 21; i += 1) {
      await call(page, 'POST', `/workspaces/${ws}/spaces/${space.id}/bugs`, {
        title: `Kutu hatası ${String(i).padStart(2, '0')}`,
        severity: 'MAJOR',
      });
    }

    // Kenar çubuğu: Bug Kutusu bağlantısı var, "Gelen Çağrılar" projesi yok.
    await page.goto('/');
    await expect(sidebar.getByRole('link', { name: 'Bug Kutusu' })).toBeVisible();
    await expect(sidebar.getByText('Gelen Çağrılar')).toHaveCount(0);
    await sidebar.getByRole('link', { name: 'Bug Kutusu' }).click();

    await expect(page.getByTestId('bug-box-page')).toBeVisible();
    // Diğer testlerin bıraktığı Bug'lar sayıları değiştirmesin: bu testin başlıklarıyla daraltılır.
    await page.getByLabel(/^Ara:/).fill('Kutu hatası');
    await expect(page.getByTestId('bug-box-total')).toHaveText('21 Bug');
    await expect(page.getByTestId('bug-box-row')).toHaveCount(20);
    await expect(page.getByTestId('bug-box-page-info')).toHaveText('Sayfa 1 / 2');
    await expect(page.getByTestId('bug-box-prev')).toBeDisabled();
    // En yeni önce: son açılan ilk satırda.
    await expect(page.getByTestId('bug-box-row').first()).toContainText('Kutu hatası 21');

    await page.getByTestId('bug-box-next').click();
    await expect(page.getByTestId('bug-box-page-info')).toHaveText('Sayfa 2 / 2');
    await expect(page.getByTestId('bug-box-row')).toHaveCount(1);
    await expect(page.getByTestId('bug-box-row')).toContainText('Kutu hatası 01');
    await expect(page.getByTestId('bug-box-next')).toBeDisabled();

    // Sıralamayı çevirmek ilk sayfaya döner; en eski önce.
    await page.getByTestId('bug-box-sort').click();
    await expect(page.getByTestId('bug-box-page-info')).toHaveText('Sayfa 1 / 2');
    await expect(page.getByTestId('bug-box-row').first()).toContainText('Kutu hatası 01');

    // Arama: başlık ve proje adı.
    await page.getByLabel(/^Ara:/).fill('hatası 17');
    await expect(page.getByTestId('bug-box-total')).toHaveText('1 Bug');
    await page.getByLabel(/^Ara:/).fill('Kutu Proje');
    await expect(page.getByTestId('bug-box-total')).toHaveText('21 Bug');
    await page.getByLabel(/^Ara:/).fill('olmayan şey');
    await expect(page.getByText('Aramana uyan Bug yok.')).toBeVisible();

    // E-posta ayarları: firma ekle (alan adı + varsayılan proje) ve kural ekle.
    await page.goto('/settings/email');
    await expect(page.getByTestId('email-settings-page')).toBeVisible();
    await expect(page.getByText('Şu an sunucu ayarı (.env) kullanılıyor')).toBeVisible();
    await page.getByTestId('add-company').click();
    const company = page.getByRole('dialog', { name: 'Firma ekle' });
    await company.getByLabel('Firma adı').fill('Acme Holding');
    await company.getByLabel('Alan adları').fill('acme.com\nacme-lojistik.com.tr');
    await company.getByLabel('Varsayılan proje').selectOption({ label: 'Kutu Proje' });
    await company.getByRole('button', { name: 'Kaydet' }).click();
    const row = page.getByTestId('company-row').filter({ hasText: 'Acme Holding' });
    await expect(row).toContainText('@acme.com');
    await expect(row).toContainText('@acme-lojistik.com.tr');
    await expect(row).toContainText('Kutu Proje');

    // Geçersiz alan adı kaydedilemez.
    await page.getByTestId('add-company').click();
    const bad = page.getByRole('dialog', { name: 'Firma ekle' });
    await bad.getByLabel('Firma adı').fill('Hatalı Firma');
    await bad.getByLabel('Alan adları').fill('geçersiz domain!');
    await expect(bad.getByRole('alert')).toContainText('geçerli bir alan adı değil');
    await expect(bad.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    await bad.getByRole('button', { name: 'İptal' }).click();

    const rules = page.getByTestId('rules-section');
    await rules.getByLabel('Firma').selectOption({ label: 'Acme Holding' });
    await rules.getByLabel('Anahtar kelime').fill('ödeme');
    await rules.getByLabel('Proje').selectOption({ label: 'Kutu Proje' });
    await rules.getByTestId('add-rule').click();
    await expect(rules.getByTestId('rule-row')).toContainText(
      'Acme Holding: “ödeme” geçerse → Kutu Proje',
    );
  });
});
