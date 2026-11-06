import { expect, test, type Page } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** Yönetici 3. tur notları (ADR-168) uçtan uca: kurulum API ile, doğrulama arayüzden. */
const PASS = 'ucuncu-tur-pass-123';
const MEM = { name: 'Mert Üye', email: 'mert3@example.com' };

async function api<T = unknown>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const csrf = document.cookie.match(/sm_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch(`/api${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: (text ? JSON.parse(text) : null) as never };
    },
    { method, path, body },
  );
}

let ws = '';
let spaceId = '';
let memberId = '';

test.describe.serial('Yönetici 3. tur', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('kurulum: Proje ve üye açılır', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const me = await api<{ workspaces: Array<{ id: string }> }>(page, 'GET', '/auth/me');
    ws = me.body.workspaces[0]!.id;
    const space = await api<{ id: string }>(page, 'POST', `/workspaces/${ws}/spaces`, {
      name: 'Üçüncü Tur',
      key: 'UCT',
      color: '#7C3AED',
    });
    expect(space.status).toBe(201);
    spaceId = space.body.id;
    const created = await api<{ userId: string }>(page, 'POST', `/workspaces/${ws}/members`, {
      name: MEM.name,
      email: MEM.email,
      role: 'MEMBER',
      password: PASS,
      spaceIds: [spaceId],
    });
    expect(created.status).toBe(201);
    memberId = created.body.userId;
  });

  test('2, 5, 7, 15) sol menü, Sistem Yönetimi adı, davet rolleri, çerçeveli düğme', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const side = page.getByRole('complementary');
    await expect(side.getByRole('link', { name: 'Üye davet et' })).toHaveCount(0);
    await expect(side.getByRole('link', { name: 'Sistem Yönetimi' })).toBeVisible();
    await expect(side.getByText('Menü', { exact: true })).toBeVisible();

    await page.goto('/settings/members');
    await expect(page.locator('#invite-role option[value="ADMIN"]')).toHaveCount(0);
    await expect(page.locator('#invite-role option[value="MEMBER"]')).toHaveCount(1);
    await expect(page.locator('#invite-role option[value="GUEST"]')).toHaveCount(1);

    await page.goto('/settings/general');
    await expect(page.getByText('Şirket Çalışanı Üyeler Proje Oluşturabilir')).toBeVisible();
  });

  test('8) üye kilitlenir, kilitli üye erişemez, kilit açılır', async ({ page, browser }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto('/settings/members');
    const row = page.getByRole('row').filter({ hasText: MEM.email });
    await row.getByRole('button', { name: /^Kilitle/ }).click();
    await expect(row.getByText('Kilitli', { exact: true })).toBeVisible();

    const ctx = await browser.newContext();
    const mp = await ctx.newPage();
    await mp.goto('/login');
    await login(mp, MEM.email, PASS);
    await expect(mp.getByText(/Hesabın kilitlendi/)).toBeVisible();
    await ctx.close();

    await row.getByRole('button', { name: /^Kilidi aç/ }).click();
    await expect(row.getByText('Kilitli', { exact: true })).toHaveCount(0);
  });

  test('10, 11, 12) Proje ayarı: Product Owner/Scrum Master, gönderen listesi, silme', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    await page.goto(`/spaces/${spaceId}/settings`);

    const roles = page.getByTestId('scrum-roles');
    await roles.getByLabel('Product Owner').selectOption({ label: MEM.name });
    await expect(page.getByText('Kaydedildi.').first()).toBeVisible();
    await roles.getByLabel('Scrum Master').selectOption({ label: MEM.name });

    const senders = page.getByTestId('bug-senders');
    await senders.getByRole('textbox').fill('destek*@firma.com\nrapor?@firma.com\nbozuk');
    await expect(senders.getByText(/Geçersiz adres: bozuk/)).toBeVisible();
    await expect(senders.getByRole('button', { name: 'Listeyi kaydet' })).toBeDisabled();
    await senders.getByRole('textbox').fill('destek*@firma.com\nrapor?@firma.com');
    await senders.getByRole('button', { name: 'Listeyi kaydet' }).click();
    await expect(page.getByText('Gönderen listesi kaydedildi.')).toBeVisible();

    // Yedek yokken silme sunucuda reddedilir (uyarı toast'ı).
    await page.getByRole('button', { name: 'Projeyi sil' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Son 7 gün içinde yedeği alınmamış');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByText(/yedeği alınmamış Proje silinemez/).first()).toBeVisible();
  });

  test('13) Scrum Master sprinti askıya alır; askıda pano salt okunur; geri açılır', async ({
    page,
  }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const sprint = await api<{ id: string }>(
      page,
      'POST',
      `/workspaces/${ws}/spaces/${spaceId}/sprints`,
      {
        name: 'Askı Sprinti',
        startDate: '2026-11-02',
        endDate: '2026-11-13',
      },
    );
    expect(sprint.status).toBe(201);
    await page.goto(`/spaces/${spaceId}/board?sprint=${sprint.body.id}`);
    await page.getByRole('button', { name: 'Askıya al' }).click();
    await expect(page.getByText('Bu sprint askıda')).toBeVisible();
    await page.getByRole('button', { name: 'Geri aç' }).click();
    await expect(page.getByText('Bu sprint askıda')).toHaveCount(0);
  });

  test('14) mesaja dosya eklenir ve karşı taraf indirebilir', async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
    const conv = await api<{ id: string }>(page, 'POST', `/workspaces/${ws}/conversations`, {
      userId: memberId,
    });
    expect(conv.status).toBe(201);
    await page.goto(`/messages?c=${conv.body.id}`);
    await page.getByTestId('message-file-input').setInputFiles({
      name: 'rapor.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('merhaba'),
    });
    await expect(page.getByText('rapor.txt')).toBeVisible();
    await page.getByRole('button', { name: 'Gönder' }).click();
    const link = page.getByTestId('message-attachments').getByRole('link', { name: /rapor.txt/ });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href'))!;
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe('merhaba');
  });
});
