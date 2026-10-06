// lib/server/requestGuard.ts
// 仅供 Route Handler（服务端 / Edge）使用的轻量防护工具，不要在 Client Component 中引入。

/** 取客户端 IP：Vercel 会覆写 x-forwarded-for，第一个值即真实来源 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * 同源校验：要求请求带 Origin 且其 host 与当前站点一致。
 * 浏览器发起的 POST fetch 一定会带 Origin；它挡不住伪造请求头的脚本，
 * 但能阻止其他网站直接在前端调用本站接口。
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
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
