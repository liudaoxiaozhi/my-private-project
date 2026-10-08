// scripts/e2e.mjs —— 端到端测试（npm run test:e2e）
//
// 1. 把 e2e/fixtures 里的测试用文章、杂谈临时放进 posts/、chatters/
// 2. 构建到单独的 .next-e2e 目录（不影响正式构建的 .next）
// 3. 运行 Playwright（自动启动 next start，见 playwright.config.ts）
// 4. 不管成功失败，最后都把测试用内容删掉
//
// 用法：
//   npm run test:e2e                         全部测试
//   npm run test:e2e -- e2e/article.spec.ts  只跑某个文件（其余参数原样传给 playwright test）
//   npm run test:e2e -- --no-build           上次已经构建过、只改了测试时跳过构建
// 第一次运行前需要装一次浏览器：npx playwright install chromium

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const FIXTURES = 'e2e/fixtures';
const CONTENT_DIRS = ['posts', 'chatters'];

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

  status = skipBuild ? 0 : run('npm', ['run', 'build']);
  if (status === 0) status = run('npx', ['playwright', 'test', ...playwrightArgs]);
} finally {
  cleanup();
}
process.exit(status);
