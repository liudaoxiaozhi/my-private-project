// e2e/interactions.spec.ts —— 照片墙（灯箱、相册进 URL、显影、取景器）和追番分镜墙
//
// 照片墙用仓库里的真实相册（至少 4 张）；追番数据默认是空的，测试里登录后台手动加两部。
import { test, expect, adminLogin } from './support';
import { ADMIN_PASSWORD } from './adminEnv';
import type { Page } from '@playwright/test';

const lightbox = (page: Page) => page.getByRole('dialog', { name: '照片查看器' });
const counter = (page: Page) => page.locator('[data-lightbox-counter]');

test.describe('照片墙', () => {
  test.use({ effects: 'off' });

  test('相册进 URL，灯箱 ←/→ 切换（首尾循环）、Esc 关闭，后退回到相册列表', async ({ page }) => {
    await page.goto('/photowall');
    await page.getByRole('button', { name: /打开相册/ }).first().click();
    await expect(page).toHaveURL(/\/photowall\?album=/);

    const thumbs = page.locator('button[data-photo-index]');
    const total = await thumbs.count();
    expect(total).toBeGreaterThan(1);

    await thumbs.first().click();
    await expect(lightbox(page)).toBeVisible();
    await expect(counter(page)).toHaveText(`1 / ${total}`);
    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText(`2 / ${total}`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(counter(page)).toHaveText(`${total} / ${total}`);
    await lightbox(page).getByRole('button', { name: '下一张' }).click();
    await expect(counter(page)).toHaveText(`1 / ${total}`);

    await page.keyboard.press('Escape');
    await expect(lightbox(page)).toHaveCount(0);
    // 关闭后焦点回到当前那张缩略图
    await expect(thumbs.first()).toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(/\/photowall$/);
    await expect(page.getByRole('button', { name: /打开相册/ }).first()).toBeVisible();
  });

  test('直接打开 ?album= 链接就是相册内页；off 档照片没有显影滤镜', async ({ page }) => {
    await page.goto('/photowall?album=illustrations');
    const img = page.locator('img[data-develop]').first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
    await expect(page.locator('[data-viewfinder-layer]')).toHaveCount(0);
  });
});

test.describe('照片墙 · full 档', () => {
  test.use({ effects: 'full' });

  test('鼠标停在照片上出现取景框，停一会儿合焦', async ({ page }) => {
    await page.goto('/photowall?album=illustrations');
    const photo = page.locator('button[data-photo-index="0"]');
    await photo.scrollIntoViewIfNeeded();
    const box = (await photo.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 3);
    await expect(page.locator('[data-viewfinder-layer][data-active]')).toHaveCount(1);
    await expect(page.locator('.vf-frame[data-focused]')).toHaveCount(1, { timeout: 3000 });
  });
});

test.describe('追番分镜墙', () => {
  test.use({ effects: 'off' });

  test('切到「分镜」显示漫画分格，记住选择；点格子打开详情', async ({ page }) => {
    await adminLogin(page, ADMIN_PASSWORD);
    await page.goto('/anime');
    const titles = [`分镜测试甲-${Date.now().toString(36)}`, `分镜测试乙-${Date.now().toString(36)}`];
    for (const title of titles) {
      await page.getByRole('button', { name: /添加/ }).first().click();
      await page.getByRole('button', { name: '手动填写' }).click();
      await page.getByText('标题 *').locator('..').locator('input').first().fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).last().click();
      await expect(page.getByText(`已添加《${title}》`)).toBeVisible();
    }

    const views = page.getByRole('group', { name: '视图' });
    await expect(views.getByRole('button', { name: '卡片' })).toHaveAttribute('aria-pressed', 'true');
    await views.getByRole('button', { name: '分镜' }).click();
    const wall = page.getByRole('region', { name: '分镜墙' });
    await expect(wall).toBeVisible();
    await expect(page.locator('section[aria-label="追番列表"]')).toHaveCount(0);
    for (const title of titles) await expect(wall.getByRole('button', { name: title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('anime-view'))).toBe('comic');

    await wall.getByRole('button', { name: titles[0], exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
