import type { Page } from '@playwright/test';

/**
 * Proje ayarlarında tıklayınca açılan bölümü açar (ADR-176); zaten açıksa dokunmaz. Yalnızca
 * "Genel" bölümü açık başlar.
 */
export async function openSection(page: Page, title: string): Promise<void> {
  const header = page.getByRole('button', { name: title, exact: true });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}
