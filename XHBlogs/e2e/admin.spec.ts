// e2e/admin.spec.ts —— 网页后台（/admin）：登录与防护、文章 / 说说 / 歌曲 / 弹幕 / 友链的增删改，以及 GitHub 提交流程
//
// 测试服务器的后台用「本地存储」，修改写进 .e2e-admin-root（scripts/e2e.mjs 准备的内容副本），这里直接读文件检查结果。
// GitHub 那一种存储不连真的 GitHub：在 Node 里换掉 fetch，检查它发出的请求序列（建 blob → 建 tree → 建提交 → 挪分支）。
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './support';
import type { Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_ROOT } from './adminEnv';
import { getStorage } from '../lib/server/admin/storage';

const file = (...parts: string[]) => path.join(ADMIN_ROOT, ...parts);
const read = (...parts: string[]) => fs.readFileSync(file(...parts), 'utf8');
const music = () => fs.readdirSync(file('public/music')).filter((n) => n.endsWith('.mp3')).sort();
/** 每次运行不一样的名字，失败重试时不会撞上上一次留下的文件 */
const unique = () => Date.now().toString(36);

// 1×1 的 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('navigation', { name: '后台板块' })).toBeVisible();
}

const section = (page: Page, name: string) => page.getByRole('navigation', { name: '后台板块' }).getByRole('button', { name, exact: true }).click();
// 连着保存两次会同时有两条一样的提示，取最新的那条
const toast = (page: Page, text: RegExp | string) => expect(page.locator('p[role="status"], p[role="alert"]').filter({ hasText: text }).last()).toBeVisible();

test.describe('登录与防护', () => {
  test('没登录时接口一律 401；密码错误有提示；登录后进概览，退出后回到登录页', async ({ page, request }) => {
    expect((await request.get('/api/admin/overview')).status()).toBe(401);
    expect((await request.get('/api/admin/content/posts')).status()).toBe(401);

    await page.goto('/admin');
    // 后台不显示网站的导航栏、桌宠
    await expect(page.locator('header nav')).toHaveCount(0);
    await page.getByLabel('管理员密码').fill('wrong-password');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('密码不对')).toBeVisible();

    await page.getByLabel('管理员密码').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByRole('heading', { name: /欢迎回来/ })).toBeVisible();
    await expect(page.getByText(/本地模式/)).toBeVisible();

    await page.getByRole('button', { name: '退出登录' }).first().click();
    await expect(page.getByLabel('管理员密码')).toBeVisible();
  });

  test('改动类请求：没有 X-Admin 头或来源不对就拒绝；路径穿越被拦下', async ({ page }) => {
    await login(page);
    const status = (init: RequestInit & { url?: string }) =>
      page.evaluate(async ({ url, init }) => (await fetch(url, init)).status, { url: init.url ?? '/api/admin/content/posts', init });
    const body = JSON.stringify({ slug: 'x', data: { title: 'x' }, body: 'x' });
    expect(await status({ method: 'POST', body, headers: { 'Content-Type': 'application/json' } })).toBe(403);
    expect(
      await status({ method: 'POST', body: JSON.stringify({ slug: '../../package', data: { title: 'x' }, body: 'x' }), headers: { 'Content-Type': 'application/json', 'X-Admin': '1' } }),
    ).toBe(400);
    expect(
      await status({
        method: 'PUT',
        url: '/api/admin/config',
        body: JSON.stringify({ patch: { geminiConfig: {} } }),
        headers: { 'Content-Type': 'application/json', 'X-Admin': '1' },
      }),
    ).toBe(400);
    expect(fs.existsSync(path.join(ADMIN_ROOT, '..', 'package.md'))).toBe(false);
  });
});

test.describe('内容', () => {
  test('写文章（带标签、预览）→ 改文件名 → 删除', async ({ page }) => {
    const slug = `admin-post-${unique()}`;
    await login(page);
    await section(page, '文章');
    await page.getByRole('button', { name: '写文章' }).first().click();
    await page.getByLabel('标题').fill('后台写的文章');
    await page.getByLabel('文件名（网址）').fill(slug);
    const tags = page.getByRole('group', { name: '标签' }).locator('input');
    await tags.fill('测试，后台');
    await tags.press('Enter');
    await page.locator('textarea').last().fill('## 小标题\n\n正文 ||黑幕||');
    await page.getByRole('button', { name: '预览', exact: true }).click();
    await expect(page.locator('.article-prose h2')).toHaveText(/小标题/);
    await page.getByRole('button', { name: '保存' }).click();
    await toast(page, /已发布/);

    const saved = read('posts', `${slug}.md`);
    expect(saved).toContain('title: 后台写的文章');
    expect(saved).toMatch(/tags:\n\s+- 测试\n\s+- 后台/);
    expect(saved).toContain('## 小标题');

    // 回到列表，打开编辑，改文件名
    await expect(page.getByRole('button', { name: /后台写的文章/ })).toBeVisible();
    await page.getByRole('button', { name: /后台写的文章/ }).click();
    await page.getByLabel('文件名（网址）').fill(`${slug}-renamed`);
    await page.getByRole('button', { name: '保存' }).click();
    await toast(page, /已保存/);
    expect(fs.existsSync(file('posts', `${slug}.md`))).toBe(false);
    expect(read('posts', `${slug}-renamed.md`)).toContain('后台写的文章');

    await page.getByRole('button', { name: '← 返回列表' }).click();
    const row = page.locator('.admin-row').filter({ hasText: '后台写的文章' });
    await row.getByRole('button', { name: '删除' }).click();
    await row.getByRole('button', { name: '确定删除？' }).click();
    await toast(page, /已删除/);
    expect(fs.existsSync(file('posts', `${slug}-renamed.md`))).toBe(false);
  });

  test('发说说：上传配图（压成 WebP），图片和说说一起写进去', async ({ page }) => {
    await login(page);
    await section(page, '说说');
    await page.getByRole('button', { name: '发说说' }).first().click();
    await page.getByLabel('地点（可不填）').fill('新加坡');
    await page.getByRole('group', { name: '配图' }).locator('input[type="file"]').setInputFiles({ name: '晚霞.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('group', { name: '配图' }).locator('img')).toHaveCount(1);
    const text = `今天的晚霞 ${unique()}`;
    await page.locator('textarea').last().fill(text);
    await page.getByRole('button', { name: '保存' }).click();
    await toast(page, /已发布/);

    const name = fs.readdirSync(file('moments')).find((n) => read('moments', n).includes(text));
    expect(name).toBeTruthy();
    const saved = read('moments', name!);
    expect(saved).toContain('location: 新加坡');
    const image = /\/images\/uploads\/\d{4}\/\d{2}\/[^\s'"]+\.webp/.exec(saved)?.[0];
    expect(image).toBeTruthy();
    expect(fs.statSync(file('public', ...image!.slice(1).split('/'))).size).toBeGreaterThan(0);
  });
});

test.describe('歌曲', () => {
  test('添加（自动认出歌手、歌名）→ 置顶（重新编号）→ 改歌名带歌词 → 删除', async ({ page }) => {
    await login(page);
    await section(page, '歌曲');
    // 只看「本地上传的歌曲」这一块（上面还有网易云）
    const local = page.locator('section').filter({ has: page.getByRole('heading', { name: '本地上传的歌曲' }) });
    const rows = local.locator('.admin-row').filter({ has: page.getByRole('button', { name: '删除' }) });
    await expect(rows).toHaveCount(3);

    await page.locator('input[type="file"][accept*=".mp3"]').setInputFiles({ name: '新歌手 - 新歌.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(2048, 2) });
    await expect(page.getByLabel('歌名')).toHaveValue('新歌');
    await expect(page.getByLabel('歌手')).toHaveValue('新歌手');
    await local.getByRole('button', { name: '添加', exact: true }).click();
    await toast(page, /已添加/);
    await expect(rows).toHaveCount(4);
    expect(music()).toContain('04. 新歌手 - 新歌.mp3');

    // 置顶：新歌变 01，其余往后挪，歌词跟着改名
    await rows.filter({ hasText: '新歌' }).getByRole('button', { name: '置顶' }).click();
    await toast(page, /顺序已调整/);
    await expect(rows.first()).toContainText('新歌');
    expect(music()).toEqual(['01. 新歌手 - 新歌.mp3', '02. 歌手甲 - 第一首.mp3', '03. 歌手乙 - 第二首.mp3', '04. 歌手丙 - 第三首.mp3']);
    expect(read('public/music', '03. 歌手乙 - 第二首.lrc')).toContain('第二首的歌词');

    // 改歌名、加歌词
    await rows.first().getByRole('button', { name: '编辑' }).click();
    await page.getByLabel('歌名').last().fill('改过的歌名');
    await page.getByLabel('歌词（LRC）').fill('[00:02.00]新写的歌词');
    await local.getByRole('button', { name: '保存', exact: true }).click();
    await toast(page, /已保存/);
    expect(music()[0]).toBe('01. 新歌手 - 改过的歌名.mp3');
    expect(read('public/music', '01. 新歌手 - 改过的歌名.lrc')).toContain('新写的歌词');

    // 删除第一首：文件和歌词都删掉，其余重新编号
    await rows.first().getByRole('button', { name: '删除' }).click();
    await rows.first().getByRole('button', { name: '确定删除？' }).click();
    await toast(page, /已删除/);
    expect(music()).toEqual(['01. 歌手甲 - 第一首.mp3', '02. 歌手乙 - 第二首.mp3', '03. 歌手丙 - 第三首.mp3']);
    expect(fs.existsSync(file('public/music', '01. 新歌手 - 改过的歌名.lrc'))).toBe(false);
  });
});

test.describe('设置与数据', () => {
  test('弹幕：加一条保存，只把改动写进 siteConfig.overrides.json；恢复默认后去掉', async ({ page }) => {
    const line = `后台弹幕-${unique()}`;
    await login(page);
    await section(page, '弹幕');
    await page.getByPlaceholder('输入一条弹幕，回车添加').fill(line);
    await page.getByPlaceholder('输入一条弹幕，回车添加').press('Enter');
    await page.getByRole('button', { name: '保存' }).click();
    await toast(page, /设置已保存/);
    const overrides = JSON.parse(read('siteConfig.overrides.json')) as Record<string, unknown>;
    expect(overrides.danmakuList).toContain(line);
    expect(Object.keys(overrides)).toEqual(['danmakuList']);

    await page.getByRole('button', { name: '恢复默认' }).click();
    await page.getByRole('button', { name: '保存' }).click();
    await toast(page, /设置已保存/);
    expect(JSON.parse(read('siteConfig.overrides.json'))).toEqual({});
  });

  test('友链：添加一个，保存进 data/friends.json', async ({ page }) => {
    const name = `朋友-${unique()}`;
    await login(page);
    await section(page, '友链');
    await page.getByRole('button', { name: '添加友链' }).click();
    await page.getByLabel('名字').fill(name);
    await page.getByLabel('网址').fill('https://example.com');
    await page.getByRole('button', { name: '保存' }).click();
    await toast(page, /已保存/);
    const friends = JSON.parse(read('data', 'friends.json')) as { name: string; url: string; id: string }[];
    expect(friends[0]).toMatchObject({ name, url: 'https://example.com' });
    expect(friends[0].id).toMatch(/^friend-/);
  });
});

// —— GitHub 存储（不开浏览器，换掉 fetch） ——

test.describe('GitHub 提交', () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;

  test.beforeEach(() => {
    for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ADMIN_STORAGE']) delete process.env[k];
    Object.assign(process.env, { GITHUB_TOKEN: 'test-token', GITHUB_REPO: 'me/blog', GITHUB_BRANCH: 'main', GITHUB_BLOG_DIR: 'XHBlogs' });
  });
  test.afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...env };
  });

  /** 假的 GitHub：记录请求；refs 的 PATCH 前 failPatches 次返回 422（模拟别人先推了一个提交） */
  function fakeGitHub(failPatches = 0) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    let patches = 0;
    let blob = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
      const p = url.pathname.replace('/repos/me/blog', '');
      calls.push({ method, path: p, body });
      const reply = (data: unknown, status = 200) => Response.json(data, { status });
      if (p === '/git/ref/heads/main') return reply({ object: { sha: 'head-sha' } });
      if (p === '/git/commits/head-sha') return reply({ tree: { sha: 'root-tree' } });
      if (p === '/git/blobs') return reply({ sha: `blob-${++blob}` });
      if (p === '/git/trees/root-tree') return reply({ tree: [{ path: 'XHBlogs', sha: 'blog-tree', type: 'tree' }] });
      if (p === '/git/trees/blog-tree') return reply({ tree: [{ path: 'posts', sha: 'posts-tree', type: 'tree' }] });
      if (p === '/git/trees/posts-tree') return reply({ tree: [{ path: 'a.md', sha: 'sha-a', type: 'blob' }, { path: 'b.md', sha: 'sha-b', type: 'blob' }] });
      if (p === '/git/trees' && method === 'POST') return reply({ sha: 'new-tree' });
      if (p === '/git/commits' && method === 'POST') return reply({ sha: 'new-commit' });
      if (p === '/git/refs/heads/main' && method === 'PATCH') return ++patches <= failPatches ? reply({ message: 'not fast forward' }, 422) : reply({});
      return reply({ message: 'not found' }, 404);
    }) as typeof fetch;
    return calls;
  }

  test('一次保存只产生一个提交：建 blob → 建 tree（加在博客子目录下）→ 建提交 → 挪分支', async () => {
    const calls = fakeGitHub();
    const storage = getStorage();
    expect(storage.kind).toBe('github');
    const { sha } = await storage.commit(
      [
        { path: 'posts/new.md', content: '# 你好' },
        { path: 'public/images/uploads/2026/10/a.webp', staged: 'a'.repeat(40) },
        { path: 'posts/old.md', delete: true },
      ],
      '后台：测试',
    );
    expect(sha).toBe('new-commit');
    const tree = calls.find((c) => c.path === '/git/trees' && c.method === 'POST')!.body as { base_tree: string; tree: { path: string; sha: string | null }[] };
    expect(tree.base_tree).toBe('root-tree');
    expect(tree.tree).toEqual([
      expect.objectContaining({ path: 'XHBlogs/posts/new.md', sha: 'blob-1' }),
      expect.objectContaining({ path: 'XHBlogs/public/images/uploads/2026/10/a.webp', sha: 'a'.repeat(40) }),
      expect.objectContaining({ path: 'XHBlogs/posts/old.md', sha: null }),
    ]);
    expect(calls.find((c) => c.path === '/git/commits' && c.method === 'POST')!.body).toMatchObject({ message: '后台：测试', parents: ['head-sha'] });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/git/refs/heads/main', body: { sha: 'new-commit', force: false } });
  });

  test('两个文件互换名字：不会把刚写入的文件当成旧名删掉', async () => {
    const calls = fakeGitHub();
    await getStorage().commit(
      [
        { path: 'posts/b.md', from: 'posts/a.md' },
        { path: 'posts/a.md', from: 'posts/b.md' },
      ],
      '互换',
    );
    const tree = calls.find((c) => c.path === '/git/trees' && c.method === 'POST')!.body as { tree: { path: string; sha: string | null }[] };
    expect(tree.tree.filter((e) => e.sha === null)).toEqual([]);
    expect(tree.tree).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'XHBlogs/posts/b.md', sha: 'sha-a' }), expect.objectContaining({ path: 'XHBlogs/posts/a.md', sha: 'sha-b' })]),
    );
  });

  test('分支被别人推进了（422）就基于最新的重做一次；后台写不到白名单以外的文件', async () => {
    const calls = fakeGitHub(1);
    await getStorage().commit([{ path: 'posts/x.md', content: 'x' }], '重试');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
    await expect(getStorage().commit([{ path: 'package.json', content: '{}' }], 'x')).rejects.toThrow(/不能修改/);
    await expect(getStorage().commit([{ path: 'posts/../package.json', content: '{}' }], 'x')).rejects.toThrow(/不合法/);
  });
});
