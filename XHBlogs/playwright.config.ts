// playwright.config.ts —— 端到端测试配置。平时用 npm run test:e2e 运行（会先放入测试内容并构建，见 scripts/e2e.mjs）
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_ROOT, REBUILD_STATUS_FILE } from './e2e/adminEnv';

const PORT = Number(process.env.E2E_PORT || 3123);
const BASE_URL = `http://localhost:${PORT}`;
const FAKE_NETEASE_PORT = 3199;

export default defineConfig({
  testDir: './e2e',
  // 不少用例在量动画时长、等滚动恢复，并行跑会互相抢 CPU，结果不稳定
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  // 动画、滚动相关的断言对机器负载敏感，失败时自动重试一次；重试才过的会在报告里标成 flaky
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: BASE_URL,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        ADMIN_PASSWORD,
        ADMIN_STORAGE: 'local',
        ADMIN_LOCAL_ROOT: ADMIN_ROOT,
        // 网易云接口指向假的（见 e2e/fake-netease.mjs）
        NETEASE_API_BASE: `http://localhost:${FAKE_NETEASE_PORT}`,
        // 自己的服务器上「保存后自动重建」（见 e2e/self-host.spec.ts）：真正的构建换成一个不到 1 秒的假命令，
        // 状态、锁、日志都放在测试目录里。别的测试保存时也会触发，假命令什么都不改，互不影响
        SELF_HOST_REBUILD: '1',
        REBUILD_DEBOUNCE_MS: '300',
        REBUILD_COMMAND: 'node -e "setTimeout(()=>{},800)"',
        REBUILD_STATUS_FILE,
      },
      // 端口上已经有别的服务（比如没关的 dev server）时直接报错，免得测到没有测试内容的旧版本
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `node e2e/fake-netease.mjs`,
      port: FAKE_NETEASE_PORT,
      env: { FAKE_NETEASE_PORT: String(FAKE_NETEASE_PORT) },
      reuseExistingServer: false,
      timeout: 15_000,
    },
  ],
});
