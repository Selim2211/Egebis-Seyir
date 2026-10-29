import { expect, type Page, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-142: yönetici panelindeki kutucuklar filtreli listeyi açar; liste sayısı kutucukla tutar. */
test.describe.serial('Yönetici paneli: tıklanabilir kutucuklar', () => {
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

  test('kutucuğa tıklayınca o kayıtların listesi açılır ve sayı tutar', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sidebar = page.getByRole('complementary');
    await sidebar.getByRole('button', { name: 'Proje oluştur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Yeni Proje oluştur' });
    await dialog.getByLabel('Ad', { exact: true }).fill('Liste Proje');
    await dialog.getByLabel('Anahtar').fill('LST');
    await dialog.getByRole('button', { name: 'Proje oluştur' }).click();
    await expect(page.getByRole('heading', { name: 'Liste Proje' })).toBeVisible();

    const me = await call<{ workspaces: Array<{ id: string }>; user: { id: string } }>(
      page,
      'GET',
      '/auth/me',
    );
    const ws = me.workspaces[0]!.id;
    const tree = await call<{ spaces: Array<{ key: string; lists: Array<{ id: string }> }> }>(
      page,
      'GET',
      `/workspaces/${ws}/hierarchy`,
    );
    const listId = tree.spaces.find((s) => s.key === 'LST')!.lists[0]!.id;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const add = (body: Record<string, unknown>) =>
      call(page, 'POST', `/workspaces/${ws}/lists/${listId}/items`, body);
    await add({
      type: 'TASK',
      title: 'Liste geciken iş',
      dueDate: yesterday,
      assigneeIds: [me.user.id],
    });
    await add({ type: 'TASK', title: 'Liste atanmamış iş' });
    await add({ type: 'BUG', title: 'Liste kritik hata', severity: 'CRITICAL' });

    const overview = () =>
      call<{ totals: { overdueItems: number; openItems: number; unassignedOpen: number } }>(
        page,
        'GET',
        `/workspaces/${ws}/admin/overview`,
      );
    const o = await overview();

    await page.getByRole('link', { name: 'Yönetici paneli' }).click();
    await expect(page.getByTestId('admin-page')).toBeVisible();

    // Geciken iş: kutucuk → liste; sayı panelle aynı, satırda işin adı var.
    await page.getByTestId('kpi-overdue-link').click();
    await expect(page).toHaveURL(/\/admin-list\?kind=overdue/);
    await expect(page.getByTestId('admin-list-title')).toHaveText('Geciken işler');
    await expect(page.getByTestId('admin-list-total')).toHaveText(`${o.totals.overdueItems} kayıt`);
    await expect(
      page.getByTestId('admin-list-row').filter({ hasText: 'Liste geciken iş' }),
    ).toBeVisible();

    // Geri dön, atanmamış iş kutucuğu.
    await page.getByRole('link', { name: 'Yönetici paneli' }).first().click();
    await page.getByTestId('kpi-unassigned-work-link').click();
    await expect(page.getByTestId('admin-list-title')).toHaveText('Atanmamış işler');
    await expect(page.getByTestId('admin-list-total')).toHaveText(
      `${o.totals.unassignedOpen} kayıt`,
    );
    await expect(
      page.getByTestId('admin-list-row').filter({ hasText: 'Liste atanmamış iş' }),
    ).toBeVisible();

    // Açık Bug kutucuğu ve satırdan işe gidiş.
    await page.getByRole('link', { name: 'Yönetici paneli' }).first().click();
    await page.getByTestId('kpi-open-link').click();
    await expect(page.getByTestId('admin-list-title')).toHaveText('Açık Bug’lar');
    await page
      .getByTestId('admin-list-row')
      .filter({ hasText: 'Liste kritik hata' })
      .getByRole('link', { name: 'Liste kritik hata' })
      .click();
    await expect(page).toHaveURL(/\/items\//);

    // Kişi etiketi: kişinin açık işleri.
    await page.goto('/admin');
    // "Bugün" kartları da kişi adını taşır; ekip yükündeki kişi etiketi seçilir.
    await page.getByTestId('admin-person-link').filter({ hasText: 'Zeynep Kaya' }).first().click();
    await expect(page).toHaveURL(/kind=person/);
    await expect(page.getByTestId('admin-list-title')).toContainText(
      'Kişinin açık işleri: Zeynep Kaya',
    );
    await expect(
      page.getByTestId('admin-list-row').filter({ hasText: 'Liste geciken iş' }),
    ).toBeVisible();
  });

  test('paneldeki bütün bağlantılar ve grafikler hata vermeden açılır; yenileme düşse ekran silinmez', async ({
    page,
  }) => {
    // Panelde onlarca bağlantı var; hepsi tek tek açıldığı için süre payı geniş tutulur.
    test.setTimeout(120_000);
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/admin');
    const admin = page.getByTestId('admin-page');
    await expect(admin).toBeVisible();
    await expect(page.getByTestId('kpi-open')).toBeVisible();

    const failed = () => page.getByText(/Beklenmeyen bir hata|Bulunamadı/);
    const hrefs = await admin
      .locator('a[href]')
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href') ?? ''))]);
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of hrefs) {
      await page.goto(href);
      if (href.startsWith('/admin-list')) {
        await expect(page.getByTestId('admin-list-title'), href).toBeVisible();
        await expect(page.getByTestId('admin-list-total'), href).toBeVisible();
      } else {
        // Sayfanın oturması için kısa bekleme; sonra hata ekranı olmamalı.
        await expect(page.getByRole('complementary')).toBeVisible();
        await page.waitForTimeout(1500);
      }
      await expect(failed(), href).toHaveCount(0);
    }

    // Grafikten tıklama: açık Bug yaşı çubuğu listeyi açar.
    await page.goto('/admin');
    await expect(page.getByTestId('chart-aging')).toBeVisible();
    await page.locator('[data-testid="chart-aging"] .recharts-bar-rectangle').first().click();
    await expect(page).toHaveURL(/kind=bugs-age/);
    await expect(failed()).toHaveCount(0);
    await expect(page.getByTestId('admin-list-total')).toBeVisible();

    // Arka plandaki yenileme düşerse son veri ekranda kalır, uyarı çıkar.
    await page.goto('/admin');
    await expect(page.getByTestId('kpi-open')).toBeVisible();
    await page.route('**/admin/overview', (route) => route.abort());
    await page.getByRole('button', { name: 'Yenile' }).click();
    await expect(page.getByTestId('admin-refresh-failed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('kpi-open')).toBeVisible();
    await expect(failed()).toHaveCount(0);
  });
});
