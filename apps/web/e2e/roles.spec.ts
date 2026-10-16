import { expect, test } from '@playwright/test';
import { ensureOwner, login, OWNER } from './accounts';

/** ADR-112: Ayarlar → Roles: izin matrisi düzenlenir, özel rol oluşturulur ve silinir. */
test.describe.serial('Roller ve izinler', () => {
  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /Hoş geldin/ })).toBeVisible();
  });

  test('matris açılır, özel rol oluşturulup izni değiştirilir, silinir', async ({ page }) => {
    await page.goto('/settings/roles');
    await expect(page.getByRole('heading', { name: 'Roles and permissions' })).toBeVisible();
    // Sistem rolü sütunları.
    await expect(page.getByRole('columnheader', { name: /Developer/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Stakeholder/ })).toBeVisible();

    await page.getByRole('button', { name: 'New role' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ad', { exact: true }).fill('QA Engineer');
    await dialog.getByRole('button', { name: 'Create role' }).click();
    await expect(page.getByText('Rol oluşturuldu.')).toBeVisible();
    const header = page.getByRole('columnheader', { name: /QA Engineer/ });
    await expect(header).toBeVisible();

    // İzin işaretle: yorum yazma.
    const box = page.getByRole('checkbox', { name: 'QA Engineer: comment.write' });
    await expect(box).not.toBeChecked();
    await box.click();
    await expect(box).toBeChecked();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'QA Engineer: comment.write' })).toBeChecked();

    // Guardrail: space.view kaldırılamaz.
    await page.getByRole('checkbox', { name: 'QA Engineer: space.view' }).click();
    await expect(page.getByText(/değişikliğe izin verilmiyor/)).toBeVisible();

    // Sil.
    await page.getByRole('button', { name: 'QA Engineer için işlemler' }).click();
    await page.getByRole('menuitem', { name: 'Delete role' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete role' }).click();
    await expect(page.getByText('Rol silindi.')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /QA Engineer/ })).toHaveCount(0);
  });
});
