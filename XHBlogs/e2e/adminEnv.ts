// e2e/adminEnv.ts —— 网页后台测试的环境：playwright.config.ts 把它传给测试服务器，admin.spec.ts 用它检查写出来的文件
import path from 'node:path';

/** 后台用的「本地存储」目录：scripts/e2e.mjs 每次运行前放进一份内容副本，后台的修改写在这里，不碰真正的文件 */
export const ADMIN_ROOT = path.resolve(process.env.E2E_ADMIN_ROOT || '.e2e-admin-root');
export const ADMIN_PASSWORD = 'e2e-admin-password';
