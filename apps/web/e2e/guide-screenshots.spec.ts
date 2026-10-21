import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureOwner, login, OWNER } from './accounts';

/**
 * Kullanıcı kılavuzu görsellerini üretir (yalnızca GUIDE_SHOTS=1 ile çalışır):
 *   GUIDE_SHOTS=1 [GUIDE_LANG=en] npx playwright test guide-screenshots
 * Çıktı: public/help/<dil>/*.png — her görselde numaralı işaretleyiciler (kırmızı çerçeve + daire) bulunur.
 * Arayüz metinleri locales/<dil>/common.json'dan okunur; bu yüzden iki dilde de aynı akış çalışır.
 */
test.skip(!process.env.GUIDE_SHOTS, 'Kılavuz görselleri yalnızca GUIDE_SHOTS=1 ile üretilir.');

const LANG = process.env.GUIDE_LANG === 'en' ? 'en' : 'tr';
const here = path.dirname(fileURLToPath(import.meta.url));
const load = (lang: string) =>
  JSON.parse(
    fs.readFileSync(path.join(here, `../src/locales/${lang}/common.json`), 'utf8'),
  ) as Record<string, unknown>;
const CUR = load(LANG);

const get = (dict: Record<string, unknown>, key: string): string => {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);
  if (typeof value !== 'string') throw new Error(`i18n anahtarı yok: ${key}`);
  return value;
};
/** Anahtardan arayüz metni; {{değişken}} doldurulur. */
const t = (key: string, vars: Record<string, string | number> = {}): string =>
  get(CUR, key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));

const SAMPLE = {
  tr: {
    space: 'Mobil Uygulama',
    key: 'MOB',
    sprint: 'Sprint 1',
    goal: 'Giriş ve kayıt akışını tamamlamak',
    capacity: '3 kişi, biri 2 gün izinli',
    task: 'Giriş ekranını tasarla',
    task2: 'Şifre sıfırlama akışı',
    task3: 'Profil sayfası',
    epic: 'Kullanıcı hesabı yönetimi',
    bigTask: 'Ödeme altyapısı',
    bigSub: 'Ödeme sağlayıcısını seç',
    sub1: 'Form alanlarını çiz',
    sub2: 'Hata mesajlarını yaz',
    desc: 'Kullanıcı e-posta ve şifreyle giriş yapabilmeli.',
    label: 'Tasarım',
    bug: 'Giriş butonu çalışmıyor',
  },
  en: {
    space: 'Mobile App',
    key: 'MOB',
    sprint: 'Sprint 1',
    goal: 'Finish the sign-in and sign-up flow',
    capacity: '3 people, one on leave for 2 days',
    task: 'Design the sign-in screen',
    task2: 'Password reset flow',
    task3: 'Profile page',
    epic: 'User account management',
    bigTask: 'Payment infrastructure',
    bigSub: 'Choose the payment provider',
    sub1: 'Draw the form fields',
    sub2: 'Write the error messages',
    desc: 'Users must be able to sign in with e-mail and password.',
    label: 'Design',
    bug: 'Sign-in button does nothing',
  },
}[LANG];

const OUT = path.join(here, '../public/help', LANG);

interface Mark {
  at: Locator;
  n: number;
  /** Çerçeve dolgusu (px). */
  pad?: number;
  /** Numara dairesinin konumu. */
  badge?: 'tl' | 'tr' | 'bl' | 'br' | 'l' | 'r' | 't' | 'b';
}

/** İşaretleyicileri sayfaya çizer, görüntüyü alır, işaretleyicileri kaldırır. */
async function shot(
  page: Page,
  name: string,
  marks: Mark[],
  crop?: Locator | { x: number; y: number; width: number; height: number },
): Promise<void> {
  const boxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    n: number;
    pad: number;
    badge: string;
  }> = [];
  for (const mark of marks) {
    const target = mark.at.first();
    await expect(target, `${name}: işaretlenecek öğe #${mark.n}`).toBeVisible();
    const box = await target.boundingBox();
    if (!box) throw new Error(`${name}: #${mark.n} konumu yok`);
    boxes.push({ ...box, n: mark.n, pad: mark.pad ?? 4, badge: mark.badge ?? 'tl' });
  }
  await page.evaluate((items) => {
    const root = document.createElement('div');
    root.id = '__guide_marks';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    for (const b of items) {
      const frame = document.createElement('div');
      frame.style.cssText = `position:absolute;left:${b.x - b.pad}px;top:${b.y - b.pad}px;width:${
        b.width + b.pad * 2
      }px;height:${b.height + b.pad * 2}px;border:3px solid #e11d48;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.85)`;
      const size = 28;
      const left = b.x - b.pad;
      const top = b.y - b.pad;
      const right = b.x + b.width + b.pad;
      const bottom = b.y + b.height + b.pad;
      const pos: Record<string, [number, number]> = {
        tl: [left - size / 2, top - size / 2],
        tr: [right - size / 2, top - size / 2],
        bl: [left - size / 2, bottom - size / 2],
        br: [right - size / 2, bottom - size / 2],
        l: [left - size - 4, top + (bottom - top) / 2 - size / 2],
        r: [right + 4, top + (bottom - top) / 2 - size / 2],
        t: [left + (right - left) / 2 - size / 2, top - size - 4],
        b: [left + (right - left) / 2 - size / 2, bottom + 4],
      };
      const [bx, by] = pos[b.badge] ?? pos.tl!;
      const badge = document.createElement('div');
      badge.textContent = String(b.n);
      badge.style.cssText = `position:absolute;left:${bx}px;top:${by}px;width:${size}px;height:${size}px;border-radius:50%;background:#e11d48;color:#fff;font:700 16px/${size}px Inter,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.35)`;
      root.append(frame, badge);
    }
    document.body.append(root);
  }, boxes);

  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (crop) {
    const raw = 'x' in crop ? crop : await crop.first().boundingBox();
    if (!raw) throw new Error(`${name}: kırpma alanı yok`);
    const viewport = page.viewportSize()!;
    const pad = 'x' in crop ? 0 : 28;
    const x = Math.max(0, raw.x - pad);
    const y = Math.max(0, raw.y - pad);
    clip = {
      x,
      y,
      width: Math.min(viewport.width - x, raw.width + pad * 2),
      height: Math.min(viewport.height - y, raw.height + pad * 2),
    };
  }
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip });
  await page.evaluate(() => document.getElementById('__guide_marks')?.remove());
}

test.describe.serial('Kılavuz görselleri', () => {
  test.setTimeout(420_000);

  test.beforeAll(async ({ request }) => {
    await ensureOwner(request);
  });

  test('tüm görseller üretilir', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = '[data-sonner-toaster]{display:none!important}';
      document.addEventListener('DOMContentLoaded', () => document.head.append(style));
    });
    await page.goto('/login');
    await login(page, OWNER.email, OWNER.password);
    await expect(page.getByRole('heading', { name: /./ }).first()).toBeVisible();

    if (LANG === 'en') {
      await page.getByRole('button', { name: new RegExp(OWNER.name) }).click();
      await page.getByRole('menuitem', { name: TR_LANGUAGE_MENU }).click();
      await page.getByRole('menuitemradio', { name: 'English' }).click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
    const sidebar = page.getByRole('complementary');

    // ---------- Space ----------
    await sidebar
      .getByRole('button', { name: t('spaces.create') })
      .first()
      .click();
    const spaceDialog = page.getByRole('dialog', { name: t('spaceForm.createTitle') });
    await spaceDialog.getByLabel(t('spaceForm.name'), { exact: true }).fill(SAMPLE.space);
    await spaceDialog.getByLabel(t('spaceForm.key')).fill(SAMPLE.key);
    await shot(
      page,
      '02-space-create',
      [
        { at: spaceDialog.getByLabel(t('spaceForm.name'), { exact: true }), n: 1, badge: 'l' },
        { at: spaceDialog.getByLabel(t('spaceForm.key')), n: 2, badge: 'l' },
        {
          at: spaceDialog.getByRole('button', { name: t('spaceForm.submitCreate') }),
          n: 3,
          badge: 'tr',
        },
      ],
      spaceDialog,
    );
    await spaceDialog.getByRole('button', { name: t('spaceForm.submitCreate') }).click();
    await expect(page.getByRole('heading', { name: SAMPLE.space })).toBeVisible();

    // ---------- Task oluşturma ----------
    await page
      .getByRole('link', { name: /^(Görevler|Tasks)$/ })
      .first()
      .click();
    const quick = page.getByRole('textbox', { name: t('items.title') });
    await expect(quick).toBeVisible();
    await page.getByLabel(t('items.type')).first().selectOption('TASK');
    await quick.fill(SAMPLE.task);
    await shot(page, '10-task-create', [
      { at: page.getByLabel(t('items.type')).first(), n: 1, badge: 't' },
      { at: quick, n: 2, badge: 't' },
      { at: page.getByRole('button', { name: t('items.addEnter') }), n: 3, badge: 't' },
    ]);
    await quick.press('Enter');
    await expect(page.getByText(t('items.created', { key: `${SAMPLE.key}-1` }))).toBeAttached();
    for (const [index, title] of [SAMPLE.task2, SAMPLE.task3].entries()) {
      await quick.fill(title);
      await quick.press('Enter');
      await expect(
        page.getByText(t('items.created', { key: `${SAMPLE.key}-${index + 2}` })),
      ).toBeAttached();
    }

    // ---------- Genel görünüm ----------
    await page.getByRole('link', { name: SAMPLE.task3 }).waitFor();
    await shot(page, '01-overview', [
      { at: sidebar.getByRole('link', { name: SAMPLE.space }).first(), n: 1, badge: 'r' },
      { at: sidebar.getByRole('link', { name: t('backlog.link') }), n: 2, badge: 'r' },
      { at: sidebar.getByRole('link', { name: t('board.link') }), n: 3, badge: 'r' },
      { at: sidebar.getByRole('link', { name: /^(Görevler|Tasks)$/ }), n: 4, badge: 'r' },
      { at: page.getByRole('button', { name: t('topbar.search') }), n: 5, badge: 'b' },
      { at: page.getByRole('link', { name: t('topbar.help') }), n: 6, badge: 'b' },
      { at: page.locator(`[aria-label^="${t('topbar.accountMenu')}"]`), n: 7, badge: 'b' },
      { at: quick, n: 8, badge: 'b' },
    ]);

    // ---------- Durum değiştirme ----------
    await page
      .getByRole('button', { name: t('items.changeStatus', { key: `${SAMPLE.key}-3` }) })
      .click();
    await shot(page, '17-task-status', [
      {
        at: page.locator(`[aria-label="${t('items.changeStatus', { key: `${SAMPLE.key}-3` })}"]`),
        n: 1,
        badge: 'l',
      },
      { at: page.getByRole('menuitemradio').nth(2), n: 2, badge: 'r' },
    ]);
    await page.keyboard.press('Escape');

    // ---------- Sub-task oluşturma ----------
    await page
      .getByRole('button', { name: t('items.actions', { key: `${SAMPLE.key}-1` }) })
      .click();
    await shot(page, '12-subtask-menu', [
      {
        at: page.locator(`[aria-label="${t('items.actions', { key: `${SAMPLE.key}-1` })}"]`),
        n: 1,
        badge: 'l',
      },
      { at: page.getByRole('menuitem', { name: t('items.addChild') }), n: 2, badge: 'l' },
    ]);
    await page.getByRole('menuitem', { name: t('items.addChild') }).click();
    const child = page.getByPlaceholder(t('items.quickCreateChild'));
    await child.fill(SAMPLE.sub1);
    await shot(page, '13-subtask-create', [
      { at: child.locator('xpath=preceding::select[1]'), n: 1, badge: 'b' },
      { at: child, n: 2, badge: 't' },
      { at: page.getByRole('button', { name: t('items.addEnter') }).first(), n: 3, badge: 't' },
    ]);
    await child.press('Enter');
    await expect(page.getByText(SAMPLE.sub1)).toBeVisible();
    await child.fill(SAMPLE.sub2);
    await child.press('Enter');
    await expect(page.getByText(SAMPLE.sub2)).toBeVisible();
    await shot(page, '14-subtask-list', [
      {
        at: page.getByRole('button', { name: t('items.collapse', { key: `${SAMPLE.key}-1` }) }),
        n: 1,
        badge: 'l',
      },
      { at: page.getByText(SAMPLE.sub1), n: 2, badge: 'l' },
      { at: page.getByText(SAMPLE.sub2), n: 3, badge: 'l' },
    ]);

    // ---------- Task düzenleme (detay paneli) ----------
    await page.getByRole('link', { name: SAMPLE.task2 }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('textbox', { name: t('items.title') }).first()).toHaveValue(
      SAMPLE.task2,
    );
    const editor = panel.getByRole('textbox', { name: t('detail.description') });
    await editor.click();
    await page.keyboard.type(SAMPLE.desc);
    await panel
      .getByRole('textbox', { name: t('items.title') })
      .first()
      .click();
    await panel.getByLabel(t('detail.dueDate')).fill('2026-10-30');
    await panel.getByLabel(t('detail.points')).selectOption('5');
    await expect(panel.getByLabel(t('detail.points'))).toHaveValue('5');
    const row = (label: string) =>
      panel.locator('dt', { hasText: label }).first().locator('xpath=..');
    await page.setViewportSize({ width: 1280, height: 980 });
    await shot(page, '11-task-edit', [
      { at: panel.getByRole('textbox', { name: t('items.title') }).first(), n: 1, badge: 'l' },
      { at: row(t('items.columns.status')), n: 2, badge: 'l', pad: 0 },
      { at: row(t('items.columns.priority')), n: 3, badge: 'l', pad: 0 },
      { at: row(t('items.columns.assignees')), n: 4, badge: 'l', pad: 0 },
      { at: row(t('detail.dueDate')), n: 5, badge: 'l', pad: 0 },
      { at: row(t('detail.points')), n: 6, badge: 'l', pad: 0 },
      { at: row(t('detail.percentDone')), n: 7, badge: 'l', pad: 0 },
      { at: editor, n: 8, badge: 'l' },
    ]);
    await page.setViewportSize({ width: 1280, height: 800 });

    // ---------- Sub-task düzenleme ----------
    const keyOf = (n: number) => `${SAMPLE.key}-${n}`;
    const titleBox = () => page.getByRole('textbox', { name: t('items.title') }).first();
    const pageRow = (label: string) => page.locator('dt', { hasText: label }).first();
    await page.goto(`/items/${keyOf(4)}`);
    await expect(titleBox()).toHaveValue(SAMPLE.sub1);
    await page.getByLabel(t('detail.points')).selectOption('2');
    await expect(page.getByLabel(t('detail.points'))).toHaveValue('2');
    await page.goto(`/items/${keyOf(5)}`);
    await expect(titleBox()).toHaveValue(SAMPLE.sub2);
    await page.getByLabel(t('detail.points')).selectOption('3');
    await expect(page.getByLabel(t('detail.points'))).toHaveValue('3');
    await page.getByRole('slider', { name: t('detail.percentDone') }).fill('50');
    await page.getByRole('slider', { name: t('detail.percentDone') }).blur();
    await expect(page.getByText('50%').first()).toBeVisible();
    await shot(page, '15-subtask-edit', [
      { at: titleBox(), n: 1, badge: 'l' },
      { at: page.getByRole('link', { name: keyOf(1) }).first(), n: 2, badge: 't' },
      { at: pageRow(t('detail.points')), n: 3, badge: 'l', pad: 6 },
      { at: pageRow(t('detail.percentDone')), n: 4, badge: 'l', pad: 6 },
    ]);

    // Üst görevde toplam
    await page.goto(`/items/${keyOf(1)}`);
    await expect(page.getByLabel(t('detail.points'))).toHaveValue('5');
    await shot(page, '16-task-rollup', [
      { at: page.getByText(t('detail.subItems')).first(), n: 1, badge: 'l' },
      { at: page.getByLabel(t('detail.points')), n: 2, badge: 'l', pad: 6 },
      { at: page.getByText(t('detail.pointsFromSubtasks')), n: 3, badge: 'b' },
    ]);

    // ---------- Sprint ----------
    await page.goto('/');
    await page.getByRole('link', { name: SAMPLE.space }).first().click();
    await page
      .getByRole('link', { name: t('backlog.link') })
      .first()
      .click();
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await expect(backlog).toBeVisible();
    await shot(page, '20-backlog', [
      { at: page.getByRole('link', { name: t('backlog.link') }).first(), n: 1, badge: 'r' },
      { at: page.getByRole('button', { name: t('sprints.create') }), n: 2, badge: 'l' },
      { at: backlog, n: 3, badge: 'tl', pad: 2 },
    ]);
    await page.getByRole('button', { name: t('sprints.create') }).click();
    const sprintDialog = page.getByRole('dialog', { name: t('sprints.createTitle') });
    await sprintDialog.getByLabel(t('sprints.name')).fill(SAMPLE.sprint);
    await sprintDialog.getByLabel(t('sprints.goal')).fill(SAMPLE.goal);
    await sprintDialog.getByLabel(t('sprints.capacity')).fill(SAMPLE.capacity);
    await shot(
      page,
      '21-sprint-create',
      [
        { at: sprintDialog.getByLabel(t('sprints.name')), n: 1, badge: 'l' },
        { at: sprintDialog.getByLabel(t('sprints.goal')), n: 2, badge: 'l' },
        { at: sprintDialog.getByLabel(t('sprints.startDate')), n: 3, badge: 'l' },
        { at: sprintDialog.getByLabel(t('sprints.endDate')), n: 4, badge: 'r' },
        { at: sprintDialog.getByLabel(t('sprints.capacity')), n: 5, badge: 'l' },
        {
          at: sprintDialog.getByRole('button', { name: t('sprints.submitCreate') }),
          n: 6,
          badge: 'tr',
        },
      ],
      sprintDialog,
    );
    await sprintDialog.getByRole('button', { name: t('sprints.submitCreate') }).click();
    const section = page.getByRole('region', { name: SAMPLE.sprint, exact: true });
    await expect(section).toBeVisible();

    // İş taşıma
    const rowMenu = (n: number) =>
      page.locator(`[aria-label="${t('items.actions', { key: keyOf(n) })}"]`);
    const moveItem = page.getByRole('menuitem', {
      name: t('backlog.moveToSprint', { name: SAMPLE.sprint }),
    });
    await rowMenu(1).click();
    await shot(page, '22-sprint-move', [
      { at: rowMenu(1), n: 1, badge: 'l' },
      { at: moveItem, n: 2, badge: 'l' },
    ]);
    await moveItem.click();
    await expect(section.getByRole('link', { name: SAMPLE.task })).toBeVisible();
    await rowMenu(2).click();
    await moveItem.click();
    await expect(section.getByRole('link', { name: SAMPLE.task2 })).toBeVisible();

    // Sprint menüsü ve düzenleme
    await section
      .getByRole('button', { name: t('sprints.actions', { name: SAMPLE.sprint }) })
      .click();
    await shot(page, '23-sprint-menu', [
      { at: page.getByRole('menuitem', { name: t('sprintStats.openBoard') }), n: 1, badge: 'l' },
      { at: page.getByRole('menuitem', { name: t('sprints.edit') }), n: 2, badge: 'l' },
      { at: page.getByRole('menuitem', { name: t('structure.delete') }), n: 3, badge: 'l' },
    ]);
    await page.getByRole('menuitem', { name: t('sprints.edit') }).click();
    const editDialog = page.getByRole('dialog', { name: t('sprints.editTitle') });
    await shot(
      page,
      '24-sprint-edit',
      [
        { at: editDialog.getByLabel(t('sprints.name')), n: 1, badge: 'l' },
        { at: editDialog.getByLabel(t('sprints.goal')), n: 2, badge: 'l' },
        { at: editDialog.getByLabel(t('sprints.endDate')), n: 3, badge: 'r' },
        { at: editDialog.getByRole('button', { name: t('common.save') }), n: 4, badge: 'tr' },
      ],
      editDialog,
    );
    await page.keyboard.press('Escape');

    // Sprint özeti
    await section
      .getByRole('button', { name: t('sprintStats.toggle', { name: SAMPLE.sprint }) })
      .click();
    await shot(
      page,
      '25-sprint-header',
      [
        { at: section.getByRole('heading', { name: SAMPLE.sprint }), n: 1, badge: 'l' },
        { at: section.getByText(t('sprints.status.PLANNED')), n: 2, badge: 't' },
        {
          at: section.getByRole('button', {
            name: t('sprintStats.toggle', { name: SAMPLE.sprint }),
          }),
          n: 3,
          badge: 'b',
        },
        { at: section.getByRole('button', { name: t('sprints.start') }), n: 4, badge: 'b' },
        {
          at: section.getByRole('region', {
            name: t('sprintStats.title', { name: SAMPLE.sprint }),
          }),
          n: 5,
          badge: 'l',
        },
      ],
      section,
    );

    // Kanban panosu
    await page
      .getByRole('link', { name: t('board.link') })
      .first()
      .click();
    await expect(page.getByText(SAMPLE.task).first()).toBeVisible();
    await shot(page, '26-board', [
      { at: page.getByRole('combobox', { name: t('board.sprint') }), n: 1, badge: 'b' },
      {
        at: page
          .getByText(SAMPLE.task)
          .first()
          .locator('xpath=ancestor::div[contains(@class,"card-hover")][1]'),
        n: 2,
        badge: 'tl',
      },
      { at: page.getByRole('button', { name: /^(Özet|Summary)/ }), n: 3, badge: 'b' },
      { at: page.getByRole('button', { name: t('sprints.start') }), n: 4, badge: 'b' },
    ]);
    // ---------- Epic ----------
    await page
      .getByRole('link', { name: /^(Görevler|Tasks)$/ })
      .first()
      .click();
    await expect(quick).toBeVisible();
    await page.getByLabel(t('items.type')).first().selectOption('EPIC');
    await quick.fill(SAMPLE.epic);
    await shot(page, '09-epic-create', [
      { at: page.getByLabel(t('items.type')).first(), n: 1, badge: 'b' },
      { at: quick, n: 2, badge: 'b' },
      { at: page.getByRole('button', { name: t('items.addEnter') }), n: 3, badge: 'b' },
    ]);
    await quick.press('Enter');
    await expect(page.getByText(t('items.created', { key: keyOf(6) }))).toBeAttached();

    // ---------- Task'ı Epic'e dönüştürme ----------
    await page.getByLabel(t('items.type')).first().selectOption('TASK');
    await quick.fill(SAMPLE.bigTask);
    await quick.press('Enter');
    await expect(page.getByText(t('items.created', { key: keyOf(7) }))).toBeAttached();
    await rowMenu(7).click();
    await page.getByRole('menuitem', { name: t('items.addChild') }).click();
    const bigChild = page.getByPlaceholder(t('items.quickCreateChild'));
    await bigChild.fill(SAMPLE.bigSub);
    await bigChild.press('Enter');
    await expect(page.getByText(SAMPLE.bigSub)).toBeVisible();
    await bigChild.press('Escape');

    await rowMenu(7).click();
    await shot(page, '18-epic-promote-menu', [
      { at: rowMenu(7), n: 1, badge: 'l' },
      { at: page.getByRole('menuitem', { name: t('promoteEpic.menu') }), n: 2, badge: 'l' },
    ]);
    await page.getByRole('menuitem', { name: t('promoteEpic.menu') }).click();
    const promoteDialog = page.getByRole('alertdialog');
    await expect(promoteDialog).toBeVisible();
    await shot(
      page,
      '19-epic-promote-dialog',
      [
        { at: promoteDialog.getByRole('heading'), n: 1, badge: 'l' },
        { at: promoteDialog.getByText(/Sub-Task/).first(), n: 2, badge: 'l' },
        {
          at: promoteDialog.getByRole('button', { name: t('promoteEpic.confirm') }),
          n: 3,
          badge: 'tr',
        },
      ],
      promoteDialog,
    );
    await promoteDialog.getByRole('button', { name: t('promoteEpic.confirm') }).click();
    await expect(page.getByText(t('promoteEpic.done', { key: keyOf(7) }))).toBeAttached();
    await expect(page.getByRole('link', { name: SAMPLE.bigTask })).toBeVisible();
    await shot(page, '20-epic-result', [
      { at: page.getByRole('link', { name: SAMPLE.epic }), n: 1, badge: 'l' },
      { at: page.getByRole('link', { name: SAMPLE.bigTask }), n: 2, badge: 'l' },
      { at: page.getByRole('link', { name: SAMPLE.bigSub }), n: 3, badge: 'l' },
    ]);

    // ---------- Sürükle-bırak: Ayır alanı ----------
    {
      const row = page.locator(`[data-item-row="${keyOf(8)}"]`);
      await row.hover();
      const handle = page.getByRole('button', { name: t('dnd.handle', { key: keyOf(8) }) });
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 60, box.y + 120, { steps: 8 });
      await page.mouse.move(760, 470, { steps: 8 });
      const zone = page.getByTestId('detach-zone');
      await expect(zone).toBeVisible();
      await shot(page, '28-dnd', [
        { at: page.locator('[data-dnd-overlay]'), n: 1, badge: 'tl' },
        { at: zone, n: 2, badge: 'tr' },
      ]);
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }

    // ---------- Bug ekranı ----------
    await page.goto('/');
    await sidebar.getByRole('link', { name: SAMPLE.space }).first().click();
    await sidebar
      .getByRole('link', { name: t('board.link') })
      .first()
      .click();
    await page.getByTestId('bugs-button').click();
    await page.getByRole('button', { name: t('bugs.report') }).click();
    const bugForm = page.getByRole('dialog', { name: t('bugs.reportTitle') });
    await bugForm.getByLabel(t('bugs.form.title')).fill(SAMPLE.bug);
    await bugForm.getByLabel(t('bugs.form.severity')).selectOption('CRITICAL');
    await bugForm.getByLabel(t('bugs.form.environment')).fill('Chrome 140, Windows 11');
    await bugForm.getByRole('button', { name: t('bugs.submit') }).click();
    await expect(page.getByRole('row', { name: new RegExp(SAMPLE.bug) })).toBeVisible();
    await shot(page, '27-bugs', [
      { at: page.getByRole('heading', { name: t('bugs.title'), level: 2 }), n: 1, badge: 'l' },
      { at: page.getByRole('button', { name: t('bugs.report') }), n: 2, badge: 'l' },
      { at: page.getByRole('tablist', { name: t('bugs.filter') }), n: 3, badge: 'tl' },
      {
        at: page
          .getByRole('combobox', { name: new RegExp(t('bugs.assignFor', { key: '' }).trim()) })
          .first(),
        n: 4,
        badge: 'b',
      },
    ]);

    // ---------- "New" menüsü ----------
    await page.getByTestId('new-menu').click();
    await shot(page, '22-new-menu', [
      { at: page.getByTestId('new-menu'), n: 1, badge: 'tr' },
      {
        at: page.getByRole('menuitem', { name: new RegExp('^' + t('newMenu.SPRINT')) }),
        n: 2,
        badge: 'r',
      },
      {
        at: page.getByRole('menuitem', { name: new RegExp('^' + t('newMenu.TASK')) }),
        n: 3,
        badge: 'r',
      },
      {
        at: page.getByRole('menuitem', { name: new RegExp('^' + t('newMenu.EPIC')) }),
        n: 4,
        badge: 'r',
      },
    ]);
    await page.keyboard.press('Escape');

    // ---------- Share: paylaşım ve gizli öğe ----------
    await page.goto(`/items/${keyOf(6)}`);
    await page.getByTestId('share-button').click();
    const shareDialog = page.getByRole('dialog', {
      name: new RegExp(t('share.title', { key: keyOf(6) }).slice(0, 12)),
    });
    await expect(shareDialog.getByRole('switch', { name: t('share.private') })).toBeVisible();
    await shot(
      page,
      '23-share',
      [
        { at: shareDialog.getByRole('switch', { name: t('share.private') }), n: 1, badge: 'l' },
        { at: shareDialog.getByLabel(t('share.add')), n: 2, badge: 'b' },
        { at: shareDialog.getByRole('button', { name: t('share.addButton') }), n: 3, badge: 'br' },
        { at: shareDialog.getByRole('button', { name: t('common.save') }), n: 4, badge: 'tr' },
      ],
      shareDialog,
    );
    await page.keyboard.press('Escape');

    // ---------- Ayarlar → Roles ----------
    await page.goto('/settings/roles');
    await expect(page.getByRole('heading', { name: t('rolesPage.title') })).toBeVisible();
    await shot(page, '24-roles', [
      { at: page.getByRole('tab', { name: t('rolesPage.scope.SPACE') }), n: 1, badge: 'tl' },
      { at: page.getByRole('button', { name: t('rolesPage.newRole') }), n: 2, badge: 'bl' },
      { at: page.getByRole('columnheader', { name: /Developer/ }), n: 3, badge: 't' },
      {
        at: page.getByRole('checkbox', { name: 'DEVELOPER: workItem.write' }).first(),
        n: 4,
        badge: 'r',
      },
    ]);

    // ---------- Kanban board ----------
    await page.goto('/');
    await sidebar.getByRole('link', { name: SAMPLE.space }).first().click();
    await sidebar
      .getByRole('link', { name: t('kanban.link') })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: t('kanban.title'), level: 2 })).toBeVisible();
    await shot(page, '25-kanban', [
      { at: page.getByRole('combobox', { name: t('kanban.list') }), n: 1, badge: 'b' },
      { at: page.getByRole('textbox', { name: t('kanban.search') }), n: 2, badge: 'b' },
      { at: sidebar.getByRole('link', { name: t('kanban.link') }).first(), n: 3, badge: 'r' },
    ]);
  });
});

const TR_LANGUAGE_MENU = /Dil|Language/;
