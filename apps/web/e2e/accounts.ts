import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** E2E hesapları (yalnızca scrum_e2e veritabanında). */
export const OWNER = {
  name: 'Zeynep Kaya',
  email: 'owner@example.com',
  password: 'e2e-owner-pass',
};
export const MEMBER = {
  name: 'Elif Demir',
  email: 'member@example.com',
  password: 'e2e-member-pass',
};

/**
 * İlk kurulum yapılmamışsa API üzerinden yapar; böylece spec dosyaları
 * birbirinden bağımsız çalışabilir.
 */
export async function ensureOwner(request: APIRequestContext): Promise<void> {
  const status = await request.get('/api/setup/status');
  const { needsSetup } = (await status.json()) as { needsSetup: boolean };
  if (!needsSetup) return;
  const cookies = await request.storageState();
  const csrf = cookies.cookies.find((c) => c.name === 'sm_csrf')?.value ?? '';
  const res = await request.post('/api/setup', {
    headers: { 'x-csrf-token': csrf },
    data: {
      workspaceName: 'E2E Kurumu',
      name: OWNER.name,
      email: OWNER.email,
      password: OWNER.password,
      locale: 'tr',
    },
  });
  expect(res.ok()).toBe(true);
}

export async function login(page: Page, email: string, password: string) {
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
