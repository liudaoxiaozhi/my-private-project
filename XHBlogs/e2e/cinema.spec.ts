// e2e/cinema.spec.ts —— 电影场景：放映厅胶片轨、电影开场黑边、首页片尾字幕、蒙太奇默认关闭
//
// 追番数据用 e2e/fixtures/data/anime.json（3 部电影、1 部剧集、1 部番剧），由 scripts/e2e.mjs 临时换进 data/。
import { test, expect } from './support';
import type { Page } from '@playwright/test';

const rail = (page: Page) => page.locator('section[aria-label="放映厅"]');
const frame = (page: Page, title: string) => rail(page).getByRole('button', { name: title, exact: true });
/** 有「在看」的作品时页面默认停在「在看」分栏，放映厅只放当前分栏里的电影和剧集 */
async function openAnime(page: Page) {
  await page.goto('/anime');
  await page.getByRole('navigation', { name: '状态' }).getByRole('button', { name: /^全部/ }).click();
}

test.describe('放映厅 · off 档', () => {
  test.use({ effects: 'off' });

  test('只放电影和剧集，原生横向滑动；点剧集直接打开详情，没有电影开场', async ({ page }) => {
    await openAnime(page);
    await expect(rail(page)).toHaveAttribute('data-mode', 'native');
    await expect(rail(page).locator('[data-film-frame]')).toHaveCount(4);
    await expect(frame(page, 'E2E 测试番剧')).toHaveCount(0);

    await frame(page, 'E2E 测试剧集').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[data-cinema]')).toHaveCount(0);
  });

  test('off 档打开电影也没有开场', async ({ page }) => {
    await openAnime(page);
    await frame(page, 'E2E 测试电影').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[data-cinema]')).toHaveCount(0);
  });
});

test.describe('放映厅 · full 档', () => {
  test.use({ effects: 'full', viewport: { width: 1440, height: 900 } });

  test('电脑上滚动驱动胶片横移，居中那格放大', async ({ page }) => {
    await openAnime(page);
    await expect(rail(page)).toHaveAttribute('data-mode', 'pinned');
    const box = (await rail(page).boundingBox())!;
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, box.y + box.height / 3);
    await expect(rail(page).locator('[data-film-frame][data-active]')).toHaveCount(1);
  });

  test('电影开场：黑边 + 片名卡，回车跳过后显示详情，Esc 关闭', async ({ page }) => {
    await openAnime(page);
    await frame(page, 'E2E 测试电影').click();
    const card = page.locator('[data-cinema-title-card]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('E2E 测试电影');
    await expect(page.locator('[data-cinema-bar="top"]')).toBeVisible();
    await expect(page.locator('[data-cinema-bar="bottom"]')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(card).toHaveCount(0);
    await expect(page.locator('[data-cinema="shown"]')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-cinema-bar]')).toHaveCount(0);
  });
});

test.describe('电影开场 · lite 档', () => {
  test.use({ effects: 'lite' });

  test('不操作也会自己放完，进入详情', async ({ page }) => {
    await openAnime(page);
    await frame(page, 'E2E 测试电影').click();
    await expect(page.locator('[data-cinema-title-card]')).toHaveAttribute('data-tier', 'lite');
    await expect(page.locator('[data-cinema="shown"]')).toHaveCount(1, { timeout: 5000 });
  });
});

test.describe('片尾字幕', () => {
  test.use({ effects: 'full' });

  test('滚到底开始上滚，可以跳过和重播；首页蒙太奇默认关闭', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('section[aria-label="开场"]')).not.toHaveAttribute('data-montage', /.*/);

    const credits = page.locator('section[aria-label="片尾字幕"]');
    await credits.scrollIntoViewIfNeeded();
    await expect(credits).toHaveAttribute('data-credits-state', 'rolling');
    await expect(credits).toContainText('E2E 测试电影');

    await credits.getByRole('button', { name: '跳过' }).click();
    await expect(credits).toHaveAttribute('data-credits-state', 'done');
    await expect(credits).toContainText('感谢观看');
    await credits.getByRole('button', { name: '重播' }).click();
    await expect(credits).toHaveAttribute('data-credits-state', 'rolling');
  });
});

test.describe('片尾字幕 · off 档', () => {
  test.use({ effects: 'off' });

  test('不滚动，全部静态显示', async ({ page }) => {
    await page.goto('/');
    const credits = page.locator('section[aria-label="片尾字幕"]');
    await credits.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await expect(credits).toHaveAttribute('data-credits-state', 'static');
    await expect(credits).toContainText('感谢观看');
    await expect(credits.getByRole('button', { name: '跳过' })).toHaveCount(0);
  });
});
