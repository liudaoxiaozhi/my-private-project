// e2e/effects.spec.ts —— 特效档位（完整 / 简洁 / 阅读）以及卡片光效、倾斜、滚动浮现
import { test, expect, openToolbox } from './support';
import type { Page } from '@playwright/test';

const level = (page: Page) => page.evaluate(() => document.documentElement.dataset.effects);

test('档位在首次绘制前就确定了', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });
  const early = await page.evaluate(
    () =>
      new Promise<string | undefined>((resolve) => {
        if (document.readyState !== 'loading') resolve(document.documentElement.dataset.effects);
        else document.addEventListener('readystatechange', () => resolve(document.documentElement.dataset.effects), { once: true });
      }),
  );
  expect(['full', 'lite', 'off']).toContain(early);
});

test('在工具箱里切换档位：对应特效挂载 / 卸载，并记住选择', async ({ page }) => {
  await page.goto('/');
  await openToolbox(page);
  await page.getByRole('button', { name: /✨ 特效/ }).click();

  const fullGates = () => page.evaluate(() => [...document.querySelectorAll('[data-fx="full"]')].map((el) => el.childElementCount));

  await page.getByRole('button', { name: /完整/ }).first().click();
  await expect.poll(() => level(page)).toBe('full');
  await expect.poll(async () => (await fullGates()).every((n) => n > 0)).toBe(true);

  await page.getByRole('button', { name: /简洁/ }).first().click();
  await expect.poll(() => level(page)).toBe('lite');
  await expect.poll(async () => (await fullGates()).every((n) => n === 0)).toBe(true);

  await page.getByRole('button', { name: /阅读/ }).first().click();
  await expect.poll(() => level(page)).toBe('off');
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-fx="lite"]')?.childElementCount)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('effects-level'))).toBe('off');
});

test('「简洁」档樱花减半；「阅读」档背景不轮播', async ({ page }) => {
  // 所有正在飘落的花瓣（远、中、近三层）
  const petals = () => page.evaluate(() => document.querySelectorAll('div[style*="petal-drift"]').length);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('effects-level', 'full'));
  await page.reload();
  await page.waitForTimeout(500);
  const full = await petals();
  await page.evaluate(() => localStorage.setItem('effects-level', 'lite'));
  await page.reload();
  await page.waitForTimeout(500);
  const lite = await petals();
  expect(full).toBeGreaterThan(0);
  expect(lite).toBeGreaterThan(0);
  expect(lite).toBeLessThanOrEqual(Math.ceil(full / 2) + 1);

  await page.evaluate(() => localStorage.setItem('effects-level', 'off'));
  await page.reload();
  const active = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[style*="--bg-desktop"]')].findIndex((el) => el.style.opacity === '1'));
  const before = await active();
  await page.waitForTimeout(11_000);
  expect(await active()).toBe(before);
});

test('另一个标签页跟着切换', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  // 等页面完成水合、订阅好存储事件再改设置
  await other.goto('/about', { waitUntil: 'networkidle' });
  await other.waitForTimeout(500);
  await page.evaluate(() => localStorage.setItem('effects-level', 'full'));
  await expect.poll(() => level(other)).toBe('full');
  await page.evaluate(() => localStorage.setItem('effects-level', 'off'));
  await expect.poll(() => level(other)).toBe('off');
});

test.describe('系统开了「减少动态效果」', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('自动档落到「阅读」', async ({ page }) => {
    await page.goto('/');
    expect(await level(page)).toBe('off');
  });
});

test.describe('卡片光效 / 倾斜', () => {
  async function hoverFirstTiltCard(page: Page) {
    await page.goto('/timeline');
    const card = page.locator('[data-tilt]').first();
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2);
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.15, { steps: 3 });
    await page.waitForTimeout(150);
    return card;
  }
  const state = (card: ReturnType<Page['locator']>) =>
    card.evaluate((el: HTMLElement) => ({ on: el.hasAttribute('data-glow-on'), gx: el.style.getPropertyValue('--gx'), rx: el.style.getPropertyValue('--rx'), ry: el.style.getPropertyValue('--ry') }));

  test.describe('完整档', () => {
    test.use({ effects: 'full' });
    test('跟随鼠标的柔光 + 3D 倾斜，移开后复原', async ({ page }) => {
      const card = await hoverFirstTiltCard(page);
      const s = await state(card);
      expect(s.on).toBe(true);
      expect(s.gx).not.toBe('');
      expect(parseFloat(s.ry)).toBeGreaterThan(2);
      expect(parseFloat(s.rx)).toBeGreaterThan(1);
      expect(await card.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
      await page.mouse.move(5, 5);
      await expect.poll(async () => (await state(card)).on).toBe(false);
    });
  });

  test.describe('简洁档', () => {
    test.use({ effects: 'lite' });
    test('只有光效，不倾斜', async ({ page }) => {
      const s = await state(await hoverFirstTiltCard(page));
      expect(s.on).toBe(true);
      expect(s.ry).toBe('');
    });
  });
});

test.describe('滚动浮现', () => {
  test.use({ viewport: { width: 1440, height: 500 }, effects: 'full' });

  test('首屏直接显示，下面的滚到眼前才浮现', async ({ page }) => {
    await page.goto('/novel');
    await page.waitForTimeout(1000);
    const snapshot = await page.evaluate(() => {
      const all = [...document.querySelectorAll('[data-reveal]')];
      return {
        ready: document.documentElement.classList.contains('reveal-ready'),
        onScreen: all.filter((e) => e.getBoundingClientRect().top < innerHeight).map((e) => e.hasAttribute('data-revealed')),
        below: all.filter((e) => e.getBoundingClientRect().top > innerHeight + 50).map((e) => [e.hasAttribute('data-revealed'), getComputedStyle(e).opacity]),
      };
    });
    expect(snapshot.ready).toBe(true);
    expect(snapshot.onScreen.length).toBeGreaterThan(0);
    expect(snapshot.onScreen.every(Boolean)).toBe(true);
    test.skip(snapshot.below.length === 0, '书架上的书不够多，没有首屏以外的项');
    expect(snapshot.below.every(([revealed, opacity]) => !revealed && opacity === '0')).toBe(true);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-reveal]')]
            .filter((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })
            .every((e) => e.hasAttribute('data-revealed') && getComputedStyle(e).opacity === '1'),
        ),
      )
      .toBe(true);
  });

  test.describe('阅读档', () => {
    test.use({ effects: 'off' });
    test('不隐藏任何内容', async ({ page }) => {
      await page.goto('/novel');
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => document.documentElement.classList.contains('reveal-ready'))).toBe(false);
      expect(await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity !== '1').length)).toBe(0);
    });
  });
});

test.describe('系统关了动画（Windows「动画效果」、减少动态效果）', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  // 用一个持续 2 秒的测试动画看全局「减少动态」规则有没有生效（生效时会被压成 0.01 毫秒）
  const probeDuration = (page: Page) =>
    page.evaluate(() => {
      const el = document.createElement('div');
      el.style.animation = 'test-probe 2s linear infinite';
      document.body.appendChild(el);
      const d = getComputedStyle(el).animationDuration;
      el.remove();
      return d;
    });

  test('「自动」跟随系统降到「阅读」；手动选「完整」后以读者的选择为准，动画照常', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => level(page)).toBe('off');
    expect(await page.evaluate(() => document.documentElement.dataset.effectsChoice)).toBeUndefined();
    expect(await probeDuration(page)).toBe('1e-05s');

    await openToolbox(page);
    await page.getByRole('button', { name: /✨ 特效/ }).click();
    await page.getByRole('button', { name: /完整/ }).first().click();
    await expect.poll(() => level(page)).toBe('full');
    expect(await page.evaluate(() => document.documentElement.dataset.effectsChoice)).toBe('manual');
    expect(await probeDuration(page)).toBe('2s');
    // 樱花等「完整」档特效挂载出来
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('[data-fx="full"]')].every((el) => el.childElementCount > 0))).toBe(true);

    // 刷新后仍然记得手动选择
    await page.reload();
    await expect.poll(() => level(page)).toBe('full');
    expect(await probeDuration(page)).toBe('2s');
  });
});
