// scripts/e2e.mjs —— 端到端测试（npm run test:e2e）
//
// 1. 把 e2e/fixtures 里的测试用文章、杂谈临时放进 posts/、chatters/
// 2. 构建到单独的 .next-e2e 目录（不影响正式构建的 .next）
// 3. 准备网页后台测试用的目录 .e2e-admin-root（内容副本，后台的修改写在这里）
// 4. 运行 Playwright（自动启动 next start，见 playwright.config.ts）
// 5. 不管成功失败，最后都把测试用内容删掉
//
// 用法：
//   npm run test:e2e                         全部测试
//   npm run test:e2e -- e2e/article.spec.ts  只跑某个文件（其余参数原样传给 playwright test）
//   npm run test:e2e -- --no-build           上次已经构建过、只改了测试时跳过构建
// 第一次运行前需要装一次浏览器：npx playwright install chromium

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FIXTURES = 'e2e/fixtures';
const CONTENT_DIRS = ['posts', 'chatters'];
const ADMIN_ROOT = path.resolve('.e2e-admin-root');

/** 后台测试的起点：文章、数据、设置的副本，加三首假的歌（几 KB 的占位文件） */
function seedAdminRoot() {
  rmSync(ADMIN_ROOT, { recursive: true, force: true });
  for (const item of ['posts', 'chatters', 'moments', 'data', 'app/about/about.md']) {
    if (existsSync(item)) cpSync(item, path.join(ADMIN_ROOT, item), { recursive: true });
  }
  // 设置从「全是默认值」开始：仓库里的 overrides 是站长在后台改过的真实设置，测试不能依赖它
  writeFileSync(path.join(ADMIN_ROOT, 'siteConfig.overrides.json'), '{}\n');
  mkdirSync(path.join(ADMIN_ROOT, 'public/music'), { recursive: true });
  for (const name of ['01. 歌手甲 - 第一首.mp3', '02. 歌手乙 - 第二首.mp3', '03. 歌手丙 - 第三首.mp3']) {
    writeFileSync(path.join(ADMIN_ROOT, 'public/music', name), Buffer.alloc(4096, 1));
  }
  writeFileSync(path.join(ADMIN_ROOT, 'public/music/02. 歌手乙 - 第二首.lrc'), '[00:01.00]第二首的歌词\n');
}

const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const playwrightArgs = args.filter((a) => a !== '--no-build');
const env = { ...process.env, NEXT_DIST_DIR: '.next-e2e' };

const copied = [];
function cleanup() {
  for (const file of copied.splice(0)) rmSync(file, { force: true });
}
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

function run(command, commandArgs) {
  // Windows 上 npm / npx 是 .cmd，需要经过 shell
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  return result.status ?? 1;
}

let status = 1;
try {
  for (const dir of CONTENT_DIRS) {
    const from = path.join(FIXTURES, dir);
    if (!existsSync(from)) continue;
    for (const name of readdirSync(from)) {
      const target = path.join(dir, name);
      copyFileSync(path.join(from, name), target);
      copied.push(target);
    }
  }

  seedAdminRoot();
  status = skipBuild ? 0 : run('npm', ['run', 'build']);
  if (status === 0) status = run('npx', ['playwright', 'test', ...playwrightArgs]);
} finally {
  cleanup();
  rmSync(ADMIN_ROOT, { recursive: true, force: true });
}
process.exit(status);
