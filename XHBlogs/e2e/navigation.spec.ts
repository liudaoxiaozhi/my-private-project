// e2e/navigation.spec.ts —— 换页：入场动画、封面过渡、进度条、前进后退方向与滚动位置、主题切换、404
import { test, expect, CONTENT_WRAPPER } from './support';
import type { Page } from '@playwright/test';

/** 记录内容外层出现过的 transform，用来判断入场动画的方向 */
async function watchTransforms(page: Page) {
  await page.evaluate((sel) => {
    const w = window as unknown as { __tf: string[] };
    w.__tf = [];
    const el = document.querySelector<HTMLElement>(sel)!;
    new MutationObserver(() => {
      const t = el.style.transform;
      if (t && t !== 'none') w.__tf.push(t);
    }).observe(el, { attributes: true, attributeFilter: ['style'] });
  }, CONTENT_WRAPPER);
}
const firstTransform = (page: Page) => page.evaluate(() => (window as unknown as { __tf: string[] }).__tf[0] || '');
const contentAtRest = (page: Page) =>
  page.evaluate((sel) => {
    const s = document.querySelector<HTMLElement>(sel)!.style;
    return s.opacity === '1' && (s.transform === '' || s.transform === 'none');
  }, CONTENT_WRAPPER);
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

test('首次打开不播入场动画；主题色取自背景图；只有一个导航栏', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);
  expect(await page.evaluate((sel) => document.querySelector<HTMLElement>(sel)?.style.opacity ?? '', CONTENT_WRAPPER)).toBe('');
  const hue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-hue').trim());
  expect(Number.isNaN(parseFloat(hue))).toBe(false);
  await expect(page.locator('header')).toHaveCount(1);
});

test('站内跳转：导航栏常驻，新页面淡入，动画结束不留 transform', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((sel) => {
    const w = window as unknown as { __nav: Element | null; __minOp: number };
    w.__nav = document.querySelector('header');
    w.__minOp = 1;
    const el = document.querySelector(sel)!;
    const t0 = performance.now();
    const tick = () => {
      w.__minOp = Math.min(w.__minOp, parseFloat(getComputedStyle(el).opacity));
      if (performance.now() - t0 < 2000) setTimeout(tick, 30);
    };
    tick();
  }, CONTENT_WRAPPER);
  await page.locator('header').getByRole('link', { name: '归档' }).click();
  await page.waitForURL('**/timeline');
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => (window as unknown as { __minOp: number }).__minOp)).toBeLessThan(0.6);
  expect(await page.evaluate(() => document.querySelector('header') === (window as unknown as { __nav: Element }).__nav)).toBe(true);
  const [opacity, transform] = await page.evaluate((sel) => { const s = document.querySelector<HTMLElement>(sel)!.style; return [s.opacity, s.transform]; }, CONTENT_WRAPPER);
  expect(opacity).toBe('1');
  expect(['', 'none']).toContain(transform);
});

test('点带封面的卡片：封面平滑变成文章头图', async ({ page }) => {
  await page.goto('/timeline');
  const card = page.locator('a[href="/posts/zz-e2e-second"]:has([data-vt-cover])').first();
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const w = window as unknown as { __vt: string[] };
    w.__vt = [];
    const orig = document.startViewTransition.bind(document);
    document.startViewTransition = ((cb: () => Promise<void>) => {
      const t = orig(cb);
      t.ready.then(
        () => w.__vt.push(`ready:${document.documentElement.dataset.vtPhase}:${document.getAnimations().filter((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement || '').includes('vt-hero')).length}`),
        (e: Error) => w.__vt.push(`skip:${e.message}`),
      );
      t.finished.then(() => w.__vt.push('finished'));
      return t;
    }) as typeof document.startViewTransition;
  });
  const t0 = Date.now();
  await card.click();
  await page.waitForURL('**/posts/zz-e2e-second');
  // 无头浏览器没有显卡，截图过渡画面要几百毫秒；这里只防「卡住好几秒」
  expect(Date.now() - t0, '换页不应该卡住').toBeLessThan(3000);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __vt: string[] }).__vt)).toContain('finished');
  const log = await page.evaluate(() => (window as unknown as { __vt: string[] }).__vt);
  expect(log[0]).toMatch(/^ready:new:[1-9]/);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.vtPhase || '')).toBe('');
  // 走封面过渡时不再叠加淡入
  expect(['', '1']).toContain(await page.evaluate((sel) => document.querySelector<HTMLElement>(sel)!.style.opacity, CONTENT_WRAPPER));

  // 文章底部的上一篇 / 下一篇
  const neighbor = page.locator('nav[aria-label="上一篇与下一篇"] a').first();
  await neighbor.scrollIntoViewIfNeeded();
  const href = await neighbor.getAttribute('href');
  const t1 = Date.now();
  await neighbor.click();
  await page.waitForURL(`**${href}`);
  expect(Date.now() - t1).toBeLessThan(3000);
  await expect.poll(() => scrollY(page)).toBeLessThan(50);
});

test('网络慢时显示顶部进度条，秒开时不闪', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.url().includes('_rsc=') || req.headers()['rsc']) await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => {});
  });
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const bar = page.locator('[role="progressbar"][aria-label="页面加载中"]');
  await page.locator('header').getByRole('link', { name: '关于' }).click();
  await expect(bar).toBeVisible();
  await page.waitForURL('**/about');
  await expect(bar).toBeHidden();
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await page.evaluate(() => {
    const w = window as unknown as { __flash: boolean };
    w.__flash = false;
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="页面加载中"]')) w.__flash = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.locator('header').getByRole('link', { name: '首页' }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __flash: boolean }).__flash)).toBe(false);
});

test('切换日夜：圆形展开动画，结束后清理干净并保存', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByText('日间模式').first();
  await toggle.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await toggle.click();
  const during = await page.evaluate(
    () =>
      new Promise<[boolean, boolean]>((resolve) => {
        const t0 = performance.now();
        const tick = () => {
          const anim = document.getAnimations().some((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement || '').includes('view-transition-new(root)'));
          if (anim || performance.now() - t0 > 2000) resolve([document.documentElement.classList.contains('theme-switching'), anim]);
          else setTimeout(tick, 20);
        };
        tick();
      }),
  );
  // 机器忙的时候可能错过动画本身的那几帧，至少要看到切换状态
  expect(during[0] || during[1]).toBe(true);
  await expect
    .poll(() => page.evaluate(() => [document.documentElement.classList.contains('dark'), document.documentElement.classList.contains('theme-switching')]))
    .toEqual([!before, false]);
  expect(await page.evaluate(() => localStorage.getItem('blog-theme'))).toBe(before ? 'light' : 'dark');
});

test('本地图片有模糊占位', async ({ page }) => {
  await page.goto('/novel', { waitUntil: 'domcontentloaded' });
  const blurred = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => (i.getAttribute('style') || '').includes('data:image')).length);
  expect(blurred).toBeGreaterThan(0);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[style*="--bg-desktop"]')!).getPropertyValue('--bg-desktop'));
  expect(bg).toContain('data:image/webp');
});

test('404：状态码正确，有导航栏和主题化页面', async ({ page }) => {
  for (const url of ['/no-such-page', '/posts/no-such-post', '/tree']) {
    const res = await page.goto(url);
    expect(res!.status(), url).toBe(404);
    await expect(page.getByText('Master，这里什么都没有')).toBeVisible();
    await expect(page.locator('header')).toHaveCount(1);
  }
});

test('音乐页导航栏固定深色；小说阅读页没有站点导航栏', async ({ page, request }) => {
  await page.goto('/music');
  expect(await page.evaluate(() => !!document.querySelector('header')?.closest('.dark.contents'))).toBe(true);

  // 找一本有章节的书（只有简介的书没有阅读页）
  const index = await (await request.get('/search-index.json')).json();
  let chapter: string | undefined;
  for (const book of (index.books ?? []) as Array<{ href: string }>) {
    await page.goto(book.href);
    chapter = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/novel/"]')].map((a) => a.getAttribute('href')!).find((h) => /^\/novel\/[^/]+\/[^/]+\/[^/]+$/.test(h)));
    if (chapter) break;
  }
  test.skip(!chapter, '书架上没有带章节的书');
  await page.goto(chapter!);
  await expect(page.locator('header').getByRole('link', { name: '归档' })).toHaveCount(0);
});

test.describe('前进 / 后退', () => {
  // 「简洁」档：卡片不倾斜。倾斜会让 Playwright 觉得卡片「不稳定」，点击前又把它滚回视野里，打乱要比对的位置
  test.use({ viewport: { width: 1440, height: 700 }, effects: 'lite' });

  for (const [from, selector] of [
    ['/novel', 'a[href^="/novel/"]'],
    ['/timeline', 'a[href^="/posts/"]'],
    ['/', 'a[href^="/posts/"]'],
  ] as const) {
    test(`${from}：后退从左滑回、前进从右滑入，都回到离开时的位置`, async ({ page }) => {
      await page.goto(from);
      await page.waitForTimeout(1000);
      const links = page.locator(selector);
      const link = links.nth((await links.count()) - 1);
      await link.scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(600);
      const y0 = await scrollY(page);

      await watchTransforms(page);
      // 直接触发点击，不用 link.click()：链接被右下角的桌宠挡住时，Playwright 会先把页面再滚一下才点，
      // 离开时的位置就不再是上面记下的 y0（网站恢复的是点击那一刻的位置，这是对的）
      await link.evaluate((el) => (el as HTMLElement).click());
      await page.waitForURL((u) => u.pathname !== from);
      await page.waitForTimeout(1200);
      // 文章卡片走封面过渡，不叠加入场动画；其余链接从下往上浮起
      if (selector.includes('posts')) expect(await firstTransform(page)).toBe('');
      else expect(await firstTransform(page)).toMatch(/translateY\(\d/);
      expect(await scrollY(page)).toBeLessThan(5);
      await page.mouse.move(700, 400);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(600);
      const y1 = await scrollY(page);

      await watchTransforms(page);
      await page.goBack();
      await page.waitForURL((u) => u.pathname === from);
      await expect.poll(() => scrollY(page)).toBe(y0);
      await expect.poll(() => firstTransform(page)).toMatch(/translateX\(-/);
      // 等后退的动画播完，免得把它的尾巴记成前进的动画
      await expect.poll(() => contentAtRest(page)).toBe(true);

      await watchTransforms(page);
      await page.goForward();
      await page.waitForURL((u) => u.pathname !== from);
      await expect.poll(() => scrollY(page)).toBe(y1);
      await expect.poll(() => firstTransform(page)).toMatch(/translateX\(\d/);
      await expect.poll(() => contentAtRest(page)).toBe(true);
    });
  }

  test('刷新后回到原来的位置', async ({ page }) => {
    await page.goto('/posts/zz-e2e-guide');
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(800);
    const y = await scrollY(page);
    expect(y).toBeGreaterThan(1000);
    await page.reload();
    await expect.poll(() => scrollY(page)).toBe(y);
  });

  test('同一个页面打开两次，各自记各自的位置', async ({ page }) => {
    await page.goto('/timeline');
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
    // 往下滚时导航栏会自动藏起来，往回滚一点让它出来
    await page.mouse.wheel(0, -60);
    await page.waitForTimeout(500);
    const first = await scrollY(page);
    expect(first).toBeGreaterThan(0);
    await page.locator('header').getByRole('link', { name: '首页' }).click();
    await page.waitForURL((u) => u.pathname === '/');
    await page.locator('header').getByRole('link', { name: '归档' }).click();
    await page.waitForURL('**/timeline');
    await page.waitForTimeout(800);
    expect(await scrollY(page)).toBeLessThan(5);
    await page.goBack();
    await page.waitForURL((u) => u.pathname === '/');
    await page.goBack();
    await page.waitForURL('**/timeline');
    await expect.poll(() => scrollY(page)).toBe(first);
  });
});

test.describe('手机', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('首页不横向溢出，主题色取自手机背景', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const hue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-hue').trim());
    expect(Number.isNaN(parseFloat(hue))).toBe(false);
  });
});
