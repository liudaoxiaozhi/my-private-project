// e2e/support.ts —— 各个测试文件共用的准备工作
//
// - 跳过开屏动画；主题、特效档位只在第一次打开时设置，测试里切换后刷新页面仍然保留
// - 默认标记「桌宠已经打过招呼」，免得招呼气泡干扰别的断言（测招呼的用例自己关掉）
// - 每个用例结束时检查页面没有报错（外链图片之类的网络错误除外）

import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

export type EffectsLevel = 'full' | 'lite' | 'off';

export interface PrepareOptions {
  theme?: 'light' | 'dark';
  /** 不设置时按站点的自动判断 */
  effects?: EffectsLevel | null;
  /** false 时桌宠会在打开网站时打招呼 */
  greeted?: boolean;
  /** true 时保留「进入网站自动放歌」（默认关掉，免得任意一次点击都开始播放、干扰别的断言） */
  music?: boolean;
}

export async function prepare(context: BrowserContext, { theme = 'light', effects = null, greeted = true, music = false }: PrepareOptions = {}) {
  await context.addInitScript(
    ({ theme, effects, greeted, music }) => {
      try {
        sessionStorage.setItem('hasSeenSplash', 'true');
        if (!music) sessionStorage.setItem('music-user-paused', '1');
        if (greeted) sessionStorage.setItem('pet-greeted', '1');
        if (!localStorage.getItem('blog-theme')) localStorage.setItem('blog-theme', theme);
        if (effects && !localStorage.getItem('effects-level')) localStorage.setItem('effects-level', effects);
      } catch {
        /* 存储不可用时按默认 */
      }
    },
    { theme, effects, greeted, music },
  );
}

// 网络层面的失败（外链图片、第三方接口）和代码无关，离线或网络受限时也会出现
const IGNORED_CONSOLE = /Failed to load resource|ERR_FAILED|CORS|preloaded using link preload/;

export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text())) errors.push(m.text());
  });
  return errors;
}

interface Options {
  theme: 'light' | 'dark';
  effects: EffectsLevel | null;
  greeted: boolean;
  music: boolean;
}

/** 用法和 @playwright/test 的 test 一样；可以用 test.use({ effects: 'full' }) 之类改初始设置 */
export const test = base.extend<Options & { errors: string[] }>({
  theme: ['light', { option: true }],
  effects: [null, { option: true }],
  greeted: [true, { option: true }],
  music: [false, { option: true }],
  context: async ({ context, theme, effects, greeted, music }, provide) => {
    await prepare(context, { theme, effects, greeted, music });
    await provide(context);
  },
  errors: [
    async ({ page }, provide) => {
      const errors = trackErrors(page);
      await provide(errors);
      expect(errors, '页面不应该报错').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** 换页内容的外层（入场动画就加在它身上） */
export const CONTENT_WRAPPER = '[data-route-content]';

/** 登录网页后台（密码见 e2e/adminEnv.ts） */
export async function adminLogin(page: Page, password: string) {
  await page.goto('/admin');
  await page.getByLabel('管理员密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('navigation', { name: '后台板块' })).toBeVisible();
}

/** 打开左下角工具箱（已经打开就不动） */
export async function openToolbox(page: Page) {
  const panel = page.getByRole('button', { name: /✨ 特效/ });
  if (await panel.isVisible().catch(() => false)) return;
  await page.locator('div.fixed.bottom-6.left-6 > button').last().click();
  await expect(panel).toBeVisible();
}
