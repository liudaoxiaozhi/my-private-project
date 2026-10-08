// e2e/toolbox.spec.ts —— 左下角工具箱：白噪音、今日御神签、召回桌宠
import { test, expect, openToolbox } from './support';
import type { Page } from '@playwright/test';
import { drawOmikuji } from '../lib/omikuji';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

async function openTab(page: Page, name: string) {
  await openToolbox(page);
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('白噪音：真的有声音，换页不停，全部停止后挂起', async ({ page }) => {
  // 拿到页面里的 AudioContext 和总压缩器，用来测实际音量
  await page.addInitScript(() => {
    const Orig = window.AudioContext;
    const w = window as unknown as { __ac: AudioContext; __comp: DynamicsCompressorNode };
    window.AudioContext = class extends Orig {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__ac = this;
      }
      createDynamicsCompressor() {
        const c = super.createDynamicsCompressor();
        w.__comp = c;
        return c;
      }
    };
  });
  await page.goto('/');
  await openTab(page, '白噪音');
  await page.getByRole('button', { name: /雨声/ }).click();
  await page.getByRole('button', { name: /篝火/ }).click();
  await page.waitForTimeout(1500);
  const sound = await page.evaluate(
    () =>
      new Promise<{ state: string; rms: number }>((resolve) => {
        const w = window as unknown as { __ac: AudioContext; __comp: DynamicsCompressorNode };
        const analyser = w.__ac.createAnalyser();
        analyser.fftSize = 2048;
        w.__comp.connect(analyser);
        setTimeout(() => {
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += v * v;
          resolve({ state: w.__ac.state, rms: Math.sqrt(sum / data.length) });
        }, 300);
      }),
  );
  expect(sound.state).toBe('running');
  expect(sound.rms).toBeGreaterThan(0.01);
  await expect(page.locator('button[aria-pressed="true"]:has-text("雨声"), button[aria-pressed="true"]:has-text("篝火")')).toHaveCount(2);
  await expect(page.getByRole('slider', { name: /音量/ })).toHaveCount(2);

  await page.getByRole('slider', { name: '雨声音量' }).fill('20');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('ambient-volume')))!).rain).toBe(0.2);

  await page.locator('header').getByRole('link', { name: '归档' }).click();
  await page.waitForURL('**/timeline');
  expect(await page.evaluate(() => (window as unknown as { __ac: AudioContext }).__ac.state)).toBe('running');
  const stopAll = page.getByRole('button', { name: /全部停止/ });
  await expect(stopAll, '换页后工具箱保持打开').toBeVisible();
  await stopAll.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ac: AudioContext }).__ac.state), { timeout: 5000 }).toBe('suspended');
});

test('御神签：抽签、桌宠念签文、当天结果不变', async ({ page }) => {
  await page.goto('/');
  await openTab(page, '御神签');
  await page.getByRole('button', { name: /摇一支签/ }).click();
  const levelName = page.locator('p.text-4xl');
  await expect(levelName).toHaveText(/吉|凶/, { timeout: 5000 });
  const drawn = await levelName.textContent();
  await expect.poll(async () => (await page.locator('[role="status"]').allTextContents()).some((t) => t.length > 5)).toBe(true);

  await page.reload();
  await openTab(page, '御神签');
  await expect(levelName).toHaveText(drawn!);
});

test('御神签：凶签可以系在樱花枝上', async ({ page }) => {
  const date = todayKey();
  let seed = 0;
  while (drawOmikuji(seed, date).level.tone !== 'bad') seed++;
  await page.goto('/');
  await page.evaluate(({ date, seed }) => localStorage.setItem('omikuji', JSON.stringify({ date, seed, tied: false })), { date, seed });
  await page.reload();
  await openTab(page, '御神签');
  const tie = page.getByRole('button', { name: /系在樱花枝上/ });
  await expect(tie).toBeVisible();
  await tie.click();
  await expect(page.getByText('已系上')).toBeVisible();
});

test('召回桌宠：收起、拖走之后一键回到默认位置', async ({ page }) => {
  await page.goto('/');
  const pet = page.getByRole('button', { name: /摸摸头/ });
  const home = (await pet.boundingBox())!;
  await page.mouse.move(home.x + 70, home.y + 70);
  await page.mouse.down();
  await page.mouse.move(400, 200, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const moved = (await pet.boundingBox())!;
  expect(Math.abs(moved.x - home.x), '可以拖动').toBeGreaterThan(100);
  await page.getByRole('button', { name: '收起桌宠' }).click({ force: true });

  await openTab(page, '桌宠');
  await page.getByRole('button', { name: /召回桌宠/ }).click();
  await expect
    .poll(async () => {
      const b = await page.getByRole('button', { name: /摸摸头/ }).boundingBox();
      return !!b && Math.abs(b.x - home.x) < 5 && Math.abs(b.y - home.y) < 15;
    })
    .toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('pet-hidden'))).toBe('0');
});
