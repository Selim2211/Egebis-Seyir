import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-143: kişi ve Proje analizi — sekmeler, süzgeçler, kutucuk/eğri, karşılaştırma. */
test.describe.serial('Analiz modülü', () => {
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

  test('kişi, Proje ve karşılaştırma sekmeleri gerçek veriyle açılır; süzgeçler adres çubuğuna yazılır', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Analiz Proje');
    await dialog.getByLabel('Anahtar').fill('ANL');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Analiz Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }>; user: { id: string } }>(
      page,
      'GET',
      '/auth/me',
    );
    const ws = me.workspaces[0]!.id;
    const tree = await call<{
      spaces: Array<{ key: string; id: string; lists: Array<{ id: string }> }>;
    }>(page, 'GET', `/workspaces/${ws}/hierarchy`);
    const space = tree.spaces.find((s) => s.key === 'ANL')!;
    const detail = await call<{ statuses: Array<{ id: string; category: string }> }>(
      page,
      'GET',
      `/workspaces/${ws}/spaces/${space.id}`,
    );
    const done = detail.statuses.find((s) => s.category === 'DONE')!;
    for (const [title, points] of [
      ['Analiz işi 1', 3],
      ['Analiz işi 2', 5],
    ] as const) {
      const item = await call<{ id: string }>(
        page,
        'POST',
        `/workspaces/${ws}/lists/${space.lists[0]!.id}/items`,
        { type: 'TASK', title, assigneeIds: [me.user.id], points, estimateHours: 2 },
      );
      await call(page, 'PATCH', `/workspaces/${ws}/items/${item.id}`, { statusId: done.id });
    }
    const api = await call<{ totals: { done: number; points: number } }>(
      page,
      'GET',
      `/workspaces/${ws}/analytics/person/${me.user.id}`,
    );
    expect(api.totals.done).toBeGreaterThanOrEqual(2);

    // Kenar çubuğundan açılır; kutucuklar API ile aynı.
    await sidebar.getByRole('link', { name: 'Analiz', exact: true }).click();
    await expect(page.getByTestId('analytics-page')).toBeVisible();
    await expect(page.getByTestId('person-view')).toBeVisible();
    await expect(page.getByTestId('kpi-done')).toHaveText(String(api.totals.done));
    await expect(page.getByTestId('chart-trend')).toBeVisible();
    await expect(page.getByTestId('chart-projects')).toBeVisible();

    // Kutucuğa tıklayınca ölçüt değişir ve adres çubuğuna yazılır.
    await page.getByRole('button', { name: /Biten iş/ }).click();
    await expect(page).toHaveURL(/am=done/);
    await expect(page.getByRole('button', { name: /Biten iş/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Zaman dilimi ve tarih ön ayarı.
    await page.getByLabel('Zaman dilimi').selectOption('month');
    await expect(page).toHaveURL(/ag=month/);
    await page.getByRole('button', { name: 'Son 30 gün' }).click();
    await expect(page).toHaveURL(/af=/);
    await expect(page.getByTestId('person-view')).toBeVisible();
    await page.getByLabel('Zaman dilimi').selectOption('sprint');
    await expect(page.getByTestId('person-view')).toBeVisible();

    // Proje sekmesi.
    await page.getByTestId('tab-project').click();
    await expect(page.getByTestId('project-view')).toBeVisible();
    await page.getByLabel('Proje', { exact: true }).selectOption({ label: 'Analiz Proje' });
    await expect(page.getByRole('heading', { name: 'Analiz Proje' })).toBeVisible();
    await expect(page.getByTestId('kpi-done')).toHaveText(String(api.totals.done));
    await expect(page.getByTestId('chart-bugflow')).toBeVisible();

    // Akış sekmesi: kutucuklar ve grafikler açılır; geçmişi olmayan işlerde uyarı çıkar.
    await page.getByTestId('tab-flow').click();
    await expect(page.getByTestId('flow-view')).toBeVisible();
    await expect(page.getByTestId('flow-kpis')).toBeVisible();
    await expect(page.getByTestId('kpi-lead')).not.toHaveText('—');
    await expect(page.getByTestId('chart-flow-trend')).toBeVisible();
    await expect(page.getByTestId('chart-aging-flow')).toBeVisible();
    await expect(page.getByText(/Beklenmeyen bir hata|Bulunamadı/)).toHaveCount(0);

    // Sprint sekmesi: özet kutucukları gelir; sprint yoksa boş durum yazılır.
    await page.getByTestId('tab-sprint').click();
    await expect(page.getByTestId('sprint-view')).toBeVisible();
    await expect(page.getByTestId('sprint-kpis')).toBeVisible();
    await expect(page.getByText(/Beklenmeyen bir hata|Bulunamadı/)).toHaveCount(0);

    // Kapasite sekmesi: kişi tablosu, kutucuklar, grafikler; haftalık saat seçimi adres çubuğuna yazılır.
    await page.getByTestId('tab-capacity').click();
    await expect(page.getByTestId('capacity-view')).toBeVisible();
    await expect(page.getByTestId('capacity-kpis')).toBeVisible();
    await expect(page.getByTestId('capacity-row').first()).toBeVisible();
    await expect(page.getByTestId('chart-weekly-capacity')).toBeVisible();
    await page.getByLabel('Haftalık çalışma saati').selectOption('36');
    await expect(page).toHaveURL(/awh=36/);
    await expect(page.getByTestId('capacity-view')).toBeVisible();
    await expect(page.getByText(/Beklenmeyen bir hata|Bulunamadı/)).toHaveCount(0);

    // Karşılaştırma sekmesi: önce boş durum, kişi eklenince sayı güncellenir.
    await page.getByTestId('tab-compare').click();
    await expect(page.getByTestId('compare-view')).toBeVisible();
    await expect(page.getByText('Karşılaştırmak için en az iki kişi seç.')).toBeVisible();
    const add = page.getByLabel('Kişi ekle…');
    await add.selectOption({ index: 1 });
    await expect(page.getByTestId('compare-chip')).toHaveCount(1);
    // Başka kullanıcı varsa ikinci kişi eklenir ve grafik/tablo gelir.
    if ((await page.getByLabel('Kişi ekle…').locator('option').count()) > 1) {
      await page.getByLabel('Kişi ekle…').selectOption({ index: 1 });
      await expect(page.getByTestId('compare-chip')).toHaveCount(2);
      await expect(page.getByTestId('chart-compare')).toBeVisible();
      await expect(page.getByTestId('compare-table')).toBeVisible();
      await expect(page.getByTestId('chart-radar')).toBeVisible();
    }
    // Çıkarma düğmesi çalışır.
    await page
      .getByRole('button', { name: /kişisini çıkar/ })
      .first()
      .click();
    await expect(page.getByText(/Beklenmeyen bir hata|Bulunamadı/)).toHaveCount(0);
  });
});
