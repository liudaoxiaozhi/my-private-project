// e2e/autoplay.spec.ts —— 进入网站自动放歌（siteConfig.autoPlayMusic）
//
// 测试浏览器默认允许自动播放（而且一开始就算「互动过」），这里模拟真实浏览器的策略：
// 访客没有真的点过 / 按过键之前，play() 一律被拒绝
import { test, expect } from './support';

test.use({ music: true });

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    let interacted = false;
    // 这段比网站自己的脚本先跑，所以这个监听在网站的之前触发
    for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, () => (interacted = true), true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!interacted) return Promise.reject(new DOMException('需要先和页面互动', 'NotAllowedError'));
      return play.call(this);
    };
  });
});

test('浏览器拦下自动播放时，访客第一次点击页面就开始放；按了暂停这次浏览就不再自动放', async ({ page }) => {
  const playing = () => page.evaluate(() => { const a = document.querySelector('audio'); return !!a && !a.paused; });
  await page.goto('/about');
  await expect.poll(() => page.evaluate(() => !!document.querySelector('audio'))).toBe(true);
  await page.waitForTimeout(800);
  expect(await playing()).toBe(false);
  await page.mouse.click(700, 300);
  await expect.poll(playing).toBe(true);

  // 在桌宠台子上的迷你播放器按暂停：记住，刷新后点页面也不再自动放
  await page.locator('[data-pet-player]').getByRole('button', { name: '暂停' }).click();
  expect(await playing()).toBe(false);
  await page.reload();
  await page.waitForTimeout(800);
  await page.mouse.click(700, 300);
  await page.waitForTimeout(500);
  expect(await playing()).toBe(false);
});
