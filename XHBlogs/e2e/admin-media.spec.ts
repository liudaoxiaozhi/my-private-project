// e2e/admin-media.spec.ts —— 网易云歌曲导入、歌词代取、密钥加密保存、登录后台后在追番页编辑
//
// 网易云接口用 e2e/fake-netease.mjs 假的（测试环境连不上 music.163.com）；后台写的是 .e2e-admin-root 里的副本。
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, adminLogin } from './support';
import type { Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_ROOT } from './adminEnv';
import { parseNeteaseInput } from '../lib/server/netease';
import { decrypt, encrypt } from '../lib/server/admin/secrets';
import crypto from 'node:crypto';

const read = (...parts: string[]) => fs.readFileSync(path.join(ADMIN_ROOT, ...parts), 'utf8');
const section = (page: Page, name: string) => page.getByRole('navigation', { name: '后台板块' }).getByRole('button', { name, exact: true }).click();
const toast = (page: Page, text: RegExp | string) => expect(page.locator('p[role="status"], p[role="alert"]').filter({ hasText: text }).last()).toBeVisible();

test.describe('网易云', () => {
  test('认出各种粘贴格式：歌曲 / 歌单链接（含 #/ 和手机分享链接）、纯数字 ID', () => {
    expect(
      parseNeteaseInput('https://music.163.com/#/song?id=101 https://music.163.com/playlist?id=900&userid=1, https://y.music.163.com/m/song/103/', 'song'),
    ).toEqual({ songs: [101, 103], playlists: [900] });
    expect(parseNeteaseInput('101，102\n102', 'song')).toEqual({ songs: [101, 102], playlists: [] });
    expect(parseNeteaseInput('900', 'playlist')).toEqual({ songs: [], playlists: [900] });
    expect(parseNeteaseInput('随便写点', 'song')).toEqual({ songs: [], playlists: [] });
  });

  test('后台：粘贴歌单链接导入三首（VIP 有标记）、单曲去重、置顶、保存进 data/netease.json', async ({ page }) => {
    await adminLogin(page, ADMIN_PASSWORD);
    await section(page, '歌曲');
    const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: '网易云歌曲' }) });
    await panel.getByPlaceholder(/粘贴歌曲或歌单链接/).fill('https://music.163.com/#/playlist?id=900');
    await panel.getByRole('button', { name: '解析并加入' }).click();
    await toast(page, /歌单「测试歌单」3 首，加入 3 首/);
    const rows = panel.locator('.admin-row').filter({ has: page.getByRole('button', { name: '移除' }) });
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('VIP');

    // 再加一首已经有的：不重复
    await panel.getByPlaceholder(/粘贴歌曲或歌单链接/).fill('103');
    await panel.getByRole('button', { name: '解析并加入' }).click();
    await toast(page, /加入 0 首（1 首已经在列表里）/);

    await rows.filter({ hasText: '稻香' }).getByRole('button', { name: '置顶' }).click();
    await panel.getByRole('button', { name: '保存' }).click();
    await toast(page, /网易云歌单已保存/);
    const saved = JSON.parse(read('data', 'netease.json')) as { id: number; title: string; cover: string; fee: number }[];
    expect(saved.map((s) => s.id)).toEqual([103, 101, 102]);
    expect(saved[1]).toMatchObject({ title: '晴天', fee: 8 });
    // 封面换成 https，并限定尺寸
    expect(saved[1].cover).toBe('https://p1.music.126.net/a.jpg?param=400y400');
  });

  test('歌词接口：代取网易云歌词，译文挂在原文下一行', async ({ request }) => {
    const res = await request.get('/api/music/lyric?id=101');
    expect(res.ok()).toBe(true);
    expect(await res.text()).toBe('[00:01.00]第一句\n[00:01.00]first line\n[00:02.00]第二句');
    expect((await request.get('/api/music/lyric?id=abc')).status()).toBe(400);
  });
});

test.describe('密钥', () => {
  test('加密：同一把钥匙解得开，换了钥匙（改了管理员密码）解不开', () => {
    const key = crypto.createHash('sha256').update('a').digest();
    const sealed = encrypt('tmdb-key-1234567890', key);
    expect(sealed).not.toContain('tmdb');
    expect(decrypt(sealed, key)).toBe('tmdb-key-1234567890');
    expect(decrypt(sealed, crypto.createHash('sha256').update('b').digest())).toBeNull();
  });

  test('后台保存 Gemini Key：仓库里只有密文，状态变成「已保存」，可以删除', async ({ page }) => {
    await adminLogin(page, ADMIN_PASSWORD);
    await section(page, '追番与密钥');
    const row = page.locator('.admin-row').filter({ hasText: 'Gemini Key' });
    await expect(row).toContainText('没有配置');
    await row.getByLabel('Gemini Key').fill('gemini-test-key-1234567890');
    await row.getByRole('button', { name: '保存' }).click();
    await toast(page, /密钥已保存/);
    await expect(row).toContainText('已保存（加密）');
    const file = read('data', 'secrets.json');
    expect(file).toContain('GEMINI_API_KEY');
    expect(file).not.toContain('gemini-test-key');

    await row.getByRole('button', { name: '删除' }).click();
    await row.getByRole('button', { name: '确定删除？' }).click();
    await toast(page, /密钥已删除/);
    await expect(row).toContainText('没有配置');
    expect(JSON.parse(read('data', 'secrets.json'))).toEqual({});
  });
});

test.describe('追番', () => {
  test('没登录：追番页只读，接口拒绝；登录后台后可以手动添加一部，写进 data/anime.json', async ({ page, request }) => {
    expect((await request.post('/api/anime', { data: { title: 'x' }, headers: { Origin: 'http://localhost:3123' } })).status()).toBe(403);
    await page.goto('/anime');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('button', { name: /添加/ })).toHaveCount(0);

    await adminLogin(page, ADMIN_PASSWORD);
    await page.goto('/anime');
    await page.getByRole('button', { name: /添加/ }).first().click();
    await page.getByRole('button', { name: '手动填写' }).click();
    const title = `后台测试番-${Date.now().toString(36)}`;
    await page.getByText('标题 *').locator('..').locator('input').first().fill(title);
    await page.getByRole('button', { name: '添加', exact: true }).last().click();
    await expect(page.getByText(`已添加《${title}》`)).toBeVisible();
    expect(read('data', 'anime.json')).toContain(title);
  });
});
