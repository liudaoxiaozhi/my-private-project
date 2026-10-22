// lib/server/requestGuard.ts
// 仅供 Route Handler（服务端 / Edge）使用的轻量防护工具，不要在 Client Component 中引入。

// —— 反向代理 ——
//
// X-Forwarded-For / X-Real-IP / X-Forwarded-Host 这些请求头谁都能伪造，只有在「前面确实有一层自己的代理、并且代理会覆盖它们」时才能信：
// - Vercel：平台本身就是这层代理（会覆写 x-forwarded-for），和以前一样直接用
// - 自己的服务器（宝塔 / nginx 反向代理）：设 TRUST_PROXY=1 才信（前面还有一层 CDN 时设成代理的层数，比如 2）。
//   这时网站只应该监听 127.0.0.1（见 ecosystem.config.cjs），外面绕不过 nginx 直接连
// - 都没设：不信任何代理请求头，只用 Host 和 TCP 连接本身的地址
//
// 注意 Next 自己会补上 x-forwarded-for（没有时填入 TCP 连接的对端地址）和 x-forwarded-host（没有时等于 Host），
// 所以「请求里有这个头」不代表前面有代理。

const onVercel = (): boolean => Boolean(process.env.VERCEL);

/** 信任几层反向代理：TRUST_PROXY=1 / true 是一层，填数字是几层；没设是 0 */
function trustedProxyHops(): number {
  const raw = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (raw === 'true' || raw === 'yes' || raw === 'on') return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10) : 0;
}

/** 取客户端 IP（登录限流、接口限流用） */
export function getClientIp(req: Request): string {
  const forwarded = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const realIp = req.headers.get('x-real-ip')?.trim() || '';
  // Vercel 会覆写 x-forwarded-for，第一个值即真实来源
  if (onVercel()) return forwarded[0] || realIp || 'unknown';
  const hops = trustedProxyHops();
  if (hops > 0) {
    // 一层代理（宝塔 / nginx）：X-Real-IP 是 nginx 用 $remote_addr 覆盖写入的；
    // 多层时取 x-forwarded-for 从右往左数第 hops 个（每层代理在末尾追加它看到的来源，左边的是客户端自己填的，不可信）
    if (hops === 1 && realIp) return realIp;
    return forwarded[Math.max(0, forwarded.length - hops)] || realIp || 'unknown';
  }
  // 不信任代理：最后一个值是离网站最近的那一跳（没有代理时就是 Next 填入的 TCP 对端地址）；客户端自己带的值在它前面，不用
  return forwarded.at(-1) || 'unknown';
}

/**
 * 同源校验：要求请求带 Origin 且其 host 与当前站点一致。
 * 浏览器发起的 POST fetch 一定会带 Origin；它挡不住伪造请求头的脚本，
 * 但能阻止其他网站直接在前端调用本站接口。
 * 站点地址取 Host；只有在 Vercel 上或 TRUST_PROXY 开启时才改用代理传来的 X-Forwarded-Host。
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  const forwardedHost = onVercel() || trustedProxyHops() > 0 ? req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() : '';
  const host = forwardedHost || req.headers.get('host');
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

interface RateLimitOptions {
  /** 命名空间，不同接口互不影响 */
  bucket: string;
  /** 窗口内最多请求数 */
  limit: number;
  /** 窗口时长（毫秒） */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** 被限流时，距离窗口重置的秒数 */
  retryAfterSec: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 5_000;
const windows = new Map<string, WindowEntry>();

/**
 * 固定窗口限流（内存版，尽力而为）。
 * Serverless / Edge 下每个实例各自计数，冷启动会清零，
 * 足以挡住普通刷接口；需要全局精确限流时请换成 Upstash Redis 等外部存储。
 */
export function rateLimit(key: string, { bucket, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const id = `${bucket}:${key}`;

  // 简单清理，防止 Map 无限增长
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(k);
    }
  }

  const entry = windows.get(id);
  if (!entry || entry.resetAt <= now) {
    windows.set(id, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** 统一的 JSON 响应 */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
