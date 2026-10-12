// e2e/media.spec.ts —— 书影音（/media）与想看清单（/media/wishlist）
//
// 数据来自 e2e/fixtures/data/anime.json（scripts/e2e.mjs 测试时替换 data/anime.json）：
// 番剧在看、电影看过、电视剧在看、书想读（★3 微信读书）、书读过、专辑想听（★1）、电影想看（★2）。
// 页面是用这份数据静态构建的；登录后台后的修改写进 .e2e-admin-root，不会改变页面，所以只检查页面上的状态。
import { test, expect, adminLogin } from './support';
import type { Page } from '@playwright/test';
import { ADMIN_PASSWORD } from './adminEnv';

const sections = (page: Page) => page.getByRole('navigation', { name: '分类' });
const statusTabs = (page: Page) => page.getByRole('navigation', { name: '状态' });
const grid = (page: Page) => page.getByRole('region', { name: '书影音列表' });
const wishlist = (page: Page) => page.getByRole('list', { name: '想看清单' });

test('旧地址 /anime 永久跳到 /media', async ({ page, request }) => {
  const res = await request.get('/anime', { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toMatch(/\/media$/);
  await page.goto('/anime');
  await expect(page).toHaveURL(/\/media$/);
  await expect(page.getByRole('heading', { name: '书影音', level: 1 })).toBeVisible();
});

test('分类筛选：「书」只显示书，状态文案是想读 / 读过；?type=music 直接打开音乐', async ({ page }) => {
  await page.goto('/media');
  await expect(grid(page).locator('li')).toHaveCount(2); // 默认「在看」：番剧和电视剧
  await expect(sections(page).getByRole('button', { name: /^全部\s*7$/ })).toBeVisible();

  await sections(page).getByRole('button', { name: /^书\s*2$/ }).click();
  await expect(page).toHaveURL(/\?type=book$/);
  const cards = grid(page).locator('li');
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: 'E2E 想读的书' })).toContainText('想读');
  await expect(cards.filter({ hasText: 'E2E 读过的书' })).toContainText('读过');
  await expect(grid(page)).not.toContainText('E2E 测试番剧');
  for (const label of ['想读', '在读', '读过']) await expect(statusTabs(page).getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
  await expect(statusTabs(page).getByRole('button', { name: /^想看/ })).toHaveCount(0);

  // 影视下面还能细分
  await sections(page).getByRole('button', { name: /^影视/ }).click();
  await page.getByRole('navigation', { name: '影视类型' }).getByRole('button', { name: /^电影/ }).click();
  await statusTabs(page).getByRole('button', { name: /^全部/ }).click();
  await expect(grid(page).locator('li')).toHaveCount(2);
  await expect(grid(page)).toContainText('E2E 想看的电影');
  await expect(grid(page)).not.toContainText('E2E 在看的电视剧');

  await page.goto('/media?type=music');
  await expect(sections(page).getByRole('button', { name: /^音乐/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(grid(page).locator('li')).toHaveCount(1);
  await expect(grid(page)).toContainText('想听');
});

test('想看清单：按优先级排，显示理由、平台和加入天数；访客没有操作按钮', async ({ page }) => {
  await page.goto('/media');
  await page.getByRole('link', { name: /想看清单/ }).click();
  await page.waitForURL('**/media/wishlist');

  const titles = wishlist(page).locator('h3');
  await expect(titles).toHaveText(['E2E 想读的书', 'E2E 想看的电影', 'E2E 想听的专辑']);
  const book = wishlist(page).locator('li').first();
  await expect(book).toContainText('朋友强烈安利');
  await expect(book).toContainText('微信读书');
  await expect(book).toContainText(/加入 \d+ 天/);
  await expect(book.getByLabel('优先级 3')).toBeVisible();

  await sections(page).getByRole('button', { name: /^音乐/ }).click();
  await expect(titles).toHaveText(['E2E 想听的专辑']);

  await page.waitForTimeout(1500); // 等「能不能编辑」的询问回来
  await expect(page.getByRole('button', { name: /^开始/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /移除/ })).toHaveCount(0);
});

test('登录后台后：想看清单上「开始读」把书移出清单；在「书」下添加默认是书', async ({ page }) => {
  await adminLogin(page, ADMIN_PASSWORD);
  await page.goto('/media/wishlist');
  const book = wishlist(page).locator('li').filter({ hasText: 'E2E 想读的书' });
  await book.getByRole('button', { name: '开始读' }).click();
  await expect(page.getByText('开始读《E2E 想读的书》')).toBeVisible();
  await expect(book).toHaveCount(0);
  await expect(wishlist(page).locator('h3')).toHaveText(['E2E 想看的电影', 'E2E 想听的专辑']);
  await expect(sections(page).getByRole('button', { name: /^书\s*0$/ })).toBeVisible();

  await page.goto('/media?type=book');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '书', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('tab', { name: 'Open Library' })).toBeVisible();
  await dialog.getByRole('button', { name: '手动填写' }).click();
  await expect(dialog.getByRole('button', { name: '书', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: '想读', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('想读清单')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '微信读书' })).toBeVisible();
});
