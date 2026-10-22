// e2e/self-host.spec.ts —— 自己的服务器上「保存后自动重建网站」（lib/server/admin/rebuild.ts、scripts/self-host/rebuild.mjs）
//
// 测试服务器开了 SELF_HOST_REBUILD=1，等待时间缩短到 300 毫秒，真正的构建换成一个 0.8 秒的假命令（见 playwright.config.ts），
// 状态文件放在 .e2e-admin-root 里，不碰项目目录。
import { test, expect, adminLogin } from './support';
import type { Page } from '@playwright/test';
import { ADMIN_PASSWORD } from './adminEnv';

interface RebuildInfo {
  enabled: boolean;
  status: { state: string; requestedAt: string | null; startedAt: string | null; finishedAt: string | null; reason: string; log: string };
  pending: boolean;
}

/** 用页面的登录 Cookie 查重建状态 */
const rebuildInfo = async (page: Page): Promise<RebuildInfo> => (await (await page.request.get('/api/admin/rebuild')).json()) as RebuildInfo;

const idle = (info: RebuildInfo) => info.status.state !== 'queued' && info.status.state !== 'building' && !info.pending;

/** 等别的测试保存后触发的重建做完 */
async function waitIdle(page: Page) {
  await expect.poll(async () => idle(await rebuildInfo(page)), { timeout: 20_000 }).toBe(true);
}

/** 等到 since 之后开始的那次重建上线；顺便记下中间看到过的状态 */
async function waitReady(page: Page, since: number, seen = new Set<string>()) {
  await expect
    .poll(
      async () => {
        const info = await rebuildInfo(page);
        seen.add(info.status.state);
        const fresh = Date.parse(info.status.startedAt ?? '') >= since;
        return fresh && info.status.state === 'ready' && !info.pending ? 'ready' : `${info.status.state}${info.pending ? '+pending' : ''}`;
      },
      { timeout: 20_000, intervals: [100] },
    )
    .toBe('ready');
  return seen;
}

const section = (page: Page, name: string) => page.getByRole('navigation', { name: '后台板块' }).getByRole('button', { name, exact: true }).click();

test.describe('自己的服务器：保存后自动重建', () => {
  test('没登录时状态接口 401；保存后 排队 → 重建中 → 已上线，顶部进度条和概览都显示出来', async ({ page, request }) => {
    expect((await request.get('/api/admin/rebuild')).status()).toBe(401);
    expect((await request.post('/api/admin/rebuild')).status()).toBe(401);

    await adminLogin(page, ADMIN_PASSWORD);
    await expect(page.getByText(/保存后网站自动重建/)).toBeVisible();
    expect((await rebuildInfo(page)).enabled).toBe(true);
    await waitIdle(page);

    const since = Date.now();
    await section(page, '弹幕');
    const input = page.getByPlaceholder('输入一条弹幕，回车添加');
    await input.fill(`重建测试-${since.toString(36)}`);
    await input.press('Enter');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.locator('p[role="status"]').filter({ hasText: /设置已保存，网站重建后上线/ }).last()).toBeVisible();

    const seen = await waitReady(page, since);
    // 0.3 秒的等待 + 0.8 秒的假构建，中间至少能看到一次「排队中」或「重建中」
    expect([...seen].some((s) => s === 'queued' || s === 'building')).toBe(true);
    const info = await rebuildInfo(page);
    expect(info.status.reason).toContain('站点设置');
    expect(Date.parse(info.status.requestedAt ?? '')).toBeGreaterThanOrEqual(since);
    expect(Date.parse(info.status.finishedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(info.status.startedAt ?? ''));

    await expect(page.getByRole('status', { name: '网站重建进度' })).toContainText('网站已经更新好了', { timeout: 10_000 });

    await section(page, '概览');
    const panel = page.getByRole('region', { name: '网站重建' });
    await expect(panel.getByText('已上线', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(panel).toContainText('站点设置');

    // 收尾：弹幕恢复默认（又会触发一次重建，等它做完，免得影响后面的测试）
    await section(page, '弹幕');
    await page.getByRole('button', { name: '恢复默认' }).click();
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.locator('p[role="status"]').filter({ hasText: /设置已保存/ }).last()).toBeVisible();
    await waitIdle(page);
  });

  test('概览里点「立即重建」：马上开始，做完显示「已上线」和「手动重建」', async ({ page }) => {
    await adminLogin(page, ADMIN_PASSWORD);
    await waitIdle(page);
    const panel = page.getByRole('region', { name: '网站重建' });
    await expect(panel).toBeVisible();

    const since = Date.now();
    await panel.getByRole('button', { name: '立即重建' }).click();
    // 手动重建不等待：用不着 300 毫秒就开始了
    await waitReady(page, since);
    const info = await rebuildInfo(page);
    expect(info.status.reason).toBe('手动重建');
    expect(info.status.log).toBe('');

    // 概览自己每 2 秒查一次，最多晚一轮
    await expect(panel.getByText('已上线', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(panel).toContainText('最近一次「手动重建」');
    await expect(panel.getByRole('button', { name: '立即重建' })).toBeEnabled();
  });
});
