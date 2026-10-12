// e2e/easter-eggs.spec.ts —— ⌘K 命令面板、各种小彩蛋、桌宠的日常反应
import { test, expect } from './support';

const PALETTE = { name: '搜索与命令' } as const;

test.describe('命令面板', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('Ctrl+K 搜索并跳转；/ 打开；最近看过；Esc 关闭', async ({ page, request }) => {
    const index = await (await request.get('/search-index.json')).json();
    expect(Array.isArray(index.posts) && index.posts.length > 0 && Array.isArray(index.books)).toBe(true);

    await page.goto('/');
    // 停留一会儿首页才会记进「最近看过」
    await page.waitForTimeout(1500);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', PALETTE);
    await expect(dialog).toBeVisible();
    await page.keyboard.type('E2E 示例');
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText('E2E 示例文章');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/posts/zz-e2e-guide');
    await page.waitForTimeout(500);

    await page.keyboard.press('/');
    await expect(dialog).toBeVisible();
    await expect(page.getByText('最近看过')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('操作：复制链接、工具在面板里打开、切换主题；导航栏按钮也能打开', async ({ page }) => {
    await page.goto('/posts/zz-e2e-guide');
    const dialog = page.getByRole('dialog', PALETTE);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('复制');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/posts\/zz-e2e-guide$/);

    await page.keyboard.press('Control+a');
    await page.keyboard.type('御神签');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('button', { name: /摇一支签/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder(/搜文章/), 'Esc 先回到搜索').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.keyboard.press('Control+k');
    await page.keyboard.type(dark ? '日间' : '夜间');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(!dark);

    await page.locator('header').getByRole('button', { name: /搜索与命令/ }).click();
    await expect(dialog).toBeVisible();
  });
});

test('控制台彩蛋、标签页标题彩蛋', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto('/posts/zz-e2e-guide', { waitUntil: 'networkidle' });
  await expect.poll(() => logs.some((t) => t.includes('欢迎来到'))).toBe(true);
  await page.waitForTimeout(500);

  const setVisibility = (state: string) =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
  await setVisibility('hidden');
  await expect.poll(() => page.title()).toContain('快回来');
  await setVisibility('visible');
  await expect.poll(() => page.title()).toContain('欢迎回来');
  await expect.poll(() => page.title(), { timeout: 4000 }).toContain('E2E 示例文章');
});

test('科乐美秘籍：樱花风暴 + 烟花，桌宠有反应，十秒后结束', async ({ page }) => {
  await page.goto('/');
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await page.keyboard.press(key);
  await page.waitForTimeout(1500);
  const storm = await page.evaluate(() => ({
    fireworks: !!document.querySelector('canvas[class*="z-[57]"]'),
    petals: document.querySelector('[class*="z-[56]"]')?.querySelectorAll(':scope > div').length ?? 0,
  }));
  expect(storm.fireworks).toBe(true);
  expect(storm.petals).toBeGreaterThanOrEqual(30);
  expect((await page.locator('[role="status"]').allTextContents()).some((t) => t.includes('秘籍'))).toBe(true);
  await expect.poll(() => page.evaluate(() => !!document.querySelector('canvas[class*="z-[57]"]')), { timeout: 15_000 }).toBe(false);
});

test('节日飘落预览：?season= 换成雪花 / 梅花 / 彩带', async ({ page }) => {
  for (const [season, shape] of [['snow', 'flake'], ['plum', 'flower'], ['confetti', 'round']]) {
    await page.goto(`/?season=${season}`);
    await expect
      .poll(() => page.evaluate(() => [...document.querySelectorAll('[class*="z-[55]"] use')].map((u) => u.getAttribute('href') || '').join(' ')))
      .toContain(shape);
  }
});

test('导航栏里没有已删除的栏目，书影音页正常', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header').getByText('灵境')).toHaveCount(0);
  await page.locator('header').getByRole('button', { name: /我的/ }).hover();
  await page.getByRole('link', { name: /书影音/ }).click();
  await page.waitForURL('**/media');
  // 书影音页自己可能有 <header>，这里只数站点导航栏
  await expect(page.locator('header').filter({ has: page.getByRole('link', { name: '归档' }) })).toHaveCount(1);
  await expect(page.locator('main').first()).toBeVisible();
});

test.describe('桌宠', () => {
  test.describe('第一次打开网站', () => {
    test.use({ greeted: false });
    test('按时间打招呼，同一次浏览只打一次', async ({ page }) => {
      // 首页没有「栏目台词」，气泡只会是招呼
      const greeting = page.locator('p[role="status"]', { hasText: /Master|早安|中午了|下午好|欢迎回来|深夜/ });
      await page.goto('/');
      await expect(greeting).toBeVisible({ timeout: 5000 });
      expect(await page.evaluate(() => sessionStorage.getItem('pet-greeted'))).toBe('1');
      await page.reload();
      await page.waitForTimeout(3500);
      await expect(page.locator('p[role="status"]')).toHaveCount(0);
    });
  });

  test('进到书架说一句书架相关的话；连着摸五下会生气', async ({ page }) => {
    await page.goto('/novel');
    await expect(page.locator('p[role="status"]', { hasText: /书架|陪你/ })).toBeVisible({ timeout: 4000 });

    // 直接点坐标：桌宠一直在轻轻晃，用 locator 点会等「稳定」，五下就超过生气的时间窗口了
    const box = (await page.getByRole('button', { name: /摸摸头/ }).boundingBox())!;
    for (let i = 0; i < 5; i++) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(120);
    }
    // 换句话时旧气泡还在淡出，所以按内容找
    await expect(page.locator('p[role="status"]', { hasText: /适可而止|再、再摸我就生气了|呆毛竖了起来/ })).toBeVisible();
    await expect(page.getByText('💢').first()).toBeVisible();
  });

  test('一分半没动静会打瞌睡，一动就醒', async ({ page }) => {
    // 只把 Date.now 往前拨，不用假时钟（假时钟会冻住动画库，Zzz 退不了场）
    await page.addInitScript(() => {
      const real = Date.now;
      const w = window as unknown as { __skew: number };
      w.__skew = 0;
      Date.now = () => real() + w.__skew;
    });
    // 等桌宠挂载好（她从挂载那一刻开始计时）再把时间拨快
    await page.goto('/about', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      (window as unknown as { __skew: number }).__skew = 100_000;
    });
    const zzz = page.locator('span[aria-hidden="true"]', { hasText: /zZ/ });
    await expect(zzz).toHaveCount(1, { timeout: 8000 });
    await page.mouse.move(400, 400);
    await page.mouse.move(420, 420, { steps: 4 });
    await expect(zzz).toHaveCount(0, { timeout: 3000 });
  });
});

test.describe('手机', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('转盘里的「搜索」打开命令面板，能用白噪音', async ({ page }) => {
    await page.goto('/');
    await page.locator('div.md\\:hidden > button.fixed').first().tap();
    await page.getByRole('link', { name: '搜索' }).tap();
    await expect(page.getByRole('dialog', PALETTE)).toBeVisible();
    await page.getByPlaceholder(/搜文章/).fill('白噪音');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /雨声/ })).toBeVisible();
  });
});
