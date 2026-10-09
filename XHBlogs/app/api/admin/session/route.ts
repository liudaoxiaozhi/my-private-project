// app/api/admin/session/route.ts —— 后台登录状态：GET 查询、POST 登录、DELETE 退出
import { checkPassword, endSession, isAdminConfigured, isLoggedIn, startSession } from '../../../../lib/server/admin/auth';
import { fail, json } from '../../../../lib/server/admin/api';
import { storageInfo } from '../../../../lib/server/admin/storage';
import { getClientIp, isSameOrigin } from '../../../../lib/server/requestGuard';

/** 输错密码的次数（同一个 IP，十分钟窗口）；只记输错的，登录成功不占次数。内存版，每个服务器实例各算各的 */
const MAX_FAILURES = 8;
const WINDOW_MS = 10 * 60_000;
const failures = new Map<string, { count: number; resetAt: number }>();

function blockedFor(ip: string, now: number): number {
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) return 0;
  return entry.count >= MAX_FAILURES ? entry.resetAt - now : 0;
}

function recordFailure(ip: string, now: number): void {
  if (failures.size > 5000) for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

export async function GET() {
  const configured = isAdminConfigured();
  const loggedIn = configured && (await isLoggedIn());
  return json({ configured, loggedIn, storage: loggedIn ? storageInfo() : null });
}

export async function POST(req: Request) {
  if (!isAdminConfigured()) return fail('后台未启用：请先在环境变量里设置 ADMIN_PASSWORD', 503);
  if (!isSameOrigin(req)) return fail('请求来源不对', 403);
  // 同一个 IP 十分钟内输错 8 次就先锁住
  const ip = getClientIp(req);
  const wait = blockedFor(ip, Date.now());
  if (wait > 0) return fail(`密码错太多次了，${Math.ceil(wait / 60_000)} 分钟后再来`, 429);
  let password = '';
  try {
    password = String(((await req.json()) as { password?: unknown }).password ?? '');
  } catch {
    /* 当作空密码 */
  }
  if (!checkPassword(password)) {
    recordFailure(ip, Date.now());
    // 放慢一点，暴力猜更费劲
    await new Promise((r) => setTimeout(r, 800));
    return fail('密码不对', 401);
  }
  await startSession();
  return json({ ok: true, storage: storageInfo() });
}

export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return fail('请求来源不对', 403);
  await endSession();
  return json({ ok: true });
}
