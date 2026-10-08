// e2e/article.spec.ts —— 文章阅读：Markdown 渲染、代码块、脚注、灯箱、目录、阅读设置、续读、读完庆祝
import { test, expect } from './support';

const POST = '/posts/zz-e2e-guide';

test.describe('文章渲染', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('各种写法都渲染出来了', async ({ page }) => {
    await page.goto(POST);
    await expect(page.locator('.code-block')).toHaveCount(4);
    await expect(page.locator('.callout')).toHaveCount(6);
    await expect(page.locator('h2#表格')).toHaveCount(1);
    await expect(page.locator('details:has-text("系列文章") li')).toHaveCount(2);
    await expect(page.locator('nav[aria-label="上一篇与下一篇"] a').first()).toBeVisible();
    await expect(page.locator('a[href^="/timeline?tag="]')).toHaveCount(2);
    await expect(page.getByText(/约 \d+ 分钟/).first()).toBeVisible();
  });

  test('代码块：复制、diff 复制、展开', async ({ page }) => {
    await page.goto(POST);
    const first = page.locator('.code-block').first();
    await first.scrollIntoViewIfNeeded();
    await first.locator('.code-copy').click();
    await expect(first.locator('.code-copy')).toHaveText('已复制');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.startsWith("import { useState } from 'react';")).toBe(true);
    expect(clip.split('\n')).toHaveLength(6);

    // diff 写法：复制时去掉删除行和标记
    await page.locator('.code-block').nth(1).locator('.code-copy').click();
    await expect(page.locator('.code-block').nth(1).locator('.code-copy')).toHaveText('已复制');
    const diff = await page.evaluate(() => navigator.clipboard.readText());
    expect(diff).not.toContain("'Hello '");
    expect(diff).not.toContain('[!code');

    const long = page.locator('.code-block.is-collapsible');
    const before = (await long.boundingBox())!.height;
    await long.locator('.code-expand').click();
    await expect.poll(async () => (await long.boundingBox())!.height).toBeGreaterThan(before + 100);
  });

  test('黑幕、脚注预览、图片灯箱', async ({ page }) => {
    await page.goto(POST);
    const spoiler = page.locator('.spoiler');
    await spoiler.scrollIntoViewIfNeeded();
    await expect(spoiler).toHaveCSS('color', 'rgba(0, 0, 0, 0)');
    await spoiler.click();
    await expect(spoiler).toHaveClass(/is-revealed/);

    await page.locator('a[data-footnote-ref]').first().hover();
    await expect(page.locator('.xh-footnote-popover')).toBeVisible();
    await page.mouse.move(5, 5);

    const img = page.locator('.article-figure img').first();
    await img.scrollIntoViewIfNeeded();
    await img.click();
    const lightbox = page.locator('[aria-label="图片预览"]');
    await expect(lightbox).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(lightbox.locator('p')).toContainText('2 / 3');
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
  });

  test('标题锚点、目录高亮、阅读进度条', async ({ page }) => {
    await page.goto(POST);
    // 用文章中段的标题：靠近文末的标题可能滚不到顶（取决于下面评论区有多高）
    const heading = page.locator('h2#提示框');
    await heading.scrollIntoViewIfNeeded();
    await heading.hover();
    await heading.locator('.heading-anchor').click();
    await expect.poll(() => decodeURIComponent(page.url())).toMatch(/#提示框$/);
    expect(decodeURIComponent(await page.evaluate(() => navigator.clipboard.readText()))).toMatch(/#提示框$/);
    await expect(page.locator('nav[aria-label="文章目录"] a[aria-current="location"]').first()).toHaveText('提示框');
    const bar = await page.evaluate(() => (document.querySelector('.origin-left') as HTMLElement | null)?.style.transform);
    expect(bar).toBeTruthy();
    expect(bar).not.toBe('scaleX(0)');
  });
});

test('阅读设置：生效、专注模式、刷新后在脚本加载前就生效', async ({ page }) => {
  await page.goto(POST);
  await page.getByRole('button', { name: '阅读设置' }).click();
  await page.getByRole('button', { name: '放大字号' }).click();
  await page.getByRole('button', { name: '宽松' }).click();
  await page.getByRole('button', { name: '黑体' }).click();
  await page.locator('label:has-text("专注模式")').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = document.getElementById('article-content')!.style;
        return [s.getPropertyValue('--ap-scale'), s.getPropertyValue('--ap-leading'), s.getPropertyValue('--ap-font').slice(0, 9), (document.querySelector('.article-layout') as HTMLElement).dataset.focus];
      }),
    )
    .toEqual(['1.0625', '2.05', 'system-ui', 'true']);
  await expect(page.locator('main.article-layout > aside')).toBeHidden();
  await page.keyboard.press('Escape');

  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.getElementById('article-content')!.style.getPropertyValue('--ap-scale'))).toBe('1.0625');
});

test('续读：记住位置，下次打开提示继续阅读', async ({ page }) => {
  await page.goto(POST);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.45));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollBy(0, 10));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('article-position:post:zz-e2e-guide'))).toBeTruthy();

  await page.goto(POST);
  const prompt = page.getByRole('button', { name: '继续阅读' });
  await expect(prompt).toBeVisible();
  await prompt.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);
});

test('直接打开 #小节 链接会停在对应标题', async ({ page }) => {
  await page.goto(`${POST}#${encodeURIComponent('表格')}`);
  await page.waitForTimeout(1500);
  const top = await page.evaluate(() => document.getElementById('表格')!.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(200);
});

test('读完文章：桌宠祝贺 + 撒一小把花瓣', async ({ page }) => {
  await page.goto(POST);
  // 气泡只停几秒，滚动本身也要几秒，所以边滚边记录
  await page.evaluate(() => {
    const seen = { bubble: [] as string[], burst: false };
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    new MutationObserver(() => {
      document.querySelectorAll('p[role="status"]').forEach((p) => {
        if (!seen.bubble.includes(p.textContent || '')) seen.bubble.push(p.textContent || '');
      });
      if (document.querySelector('[class*="z-[56]"]')) seen.burst = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.mouse.move(700, 450);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(80);
  }
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seen: { bubble: string[]; burst: boolean } }).__seen))
    .toMatchObject({ burst: true, bubble: expect.arrayContaining([expect.stringMatching(/读完/)]) });
});

test('杂谈也支持代码块（默认 C++）、提示框和黑幕', async ({ page }) => {
  await page.goto('/chatter/zz-e2e-chatter');
  await expect(page.locator('.code-block[data-lang="cpp"]')).toHaveCount(1);
  await expect(page.locator('.callout-tip .spoiler')).toHaveCount(1);
});

test('归档页按网址里的标签筛选', async ({ page }) => {
  await page.goto('/timeline?tag=' + encodeURIComponent('测试指南'));
  await expect(page.locator('button.bg-indigo-500').first()).toContainText('测试指南');
});

test.describe('手机', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('不横向溢出，表格在框内滚动', async ({ page }) => {
    await page.goto(POST);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => { const w = document.querySelector('.table-wrap')!; return w.scrollWidth > w.clientWidth; })).toBe(true);
  });

  test('点脚注是预览而不是跳走；目录抽屉能跳到小节', async ({ page }) => {
    await page.goto(POST);
    const ref = page.locator('a[data-footnote-ref]').first();
    await ref.scrollIntoViewIfNeeded();
    await ref.tap();
    await expect(page.locator('.xh-footnote-popover')).toBeVisible();
    await page.locator('h2#黑幕').tap().catch(() => {});

    await page.getByRole('button', { name: '打开目录' }).tap();
    const sheet = page.getByRole('dialog', { name: '文章目录' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: '表格' }).tap();
    await expect
      .poll(() => page.evaluate(() => document.getElementById('表格')!.getBoundingClientRect().top))
      .toBeLessThan(200);
    expect(await page.evaluate(() => document.getElementById('表格')!.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  });
});
