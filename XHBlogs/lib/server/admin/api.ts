// lib/server/admin/api.ts —— 后台接口的公共外壳：检查登录、防跨站、统一报错格式（仅服务端）
import { isAdminConfigured, isLoggedIn } from './auth';
import { StorageError } from './storage';
import { isSameOrigin } from '../requestGuard';

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (message: string, status: number): Response => json({ ok: false, error: message }, status);

/**
 * 包一层：没配密码 → 503；没登录 → 401；改动类请求（非 GET）还要求同源 + 带 X-Admin 请求头
 * （自定义请求头会让跨站请求先发预检被浏览器拦下，配合 SameSite=Strict 的 Cookie 防 CSRF）
 */
export function adminRoute<A extends unknown[]>(handler: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A): Promise<Response> => {
    if (!isAdminConfigured()) return fail('后台未启用：请先在环境变量里设置 ADMIN_PASSWORD', 503);
    if (!(await isLoggedIn())) return fail('请先登录', 401);
    if (req.method !== 'GET' && (req.headers.get('x-admin') !== '1' || !isSameOrigin(req))) return fail('请求来源不对', 403);
    try {
      return await handler(req, ...args);
    } catch (error) {
      if (error instanceof StorageError) return fail(error.message, error.status);
      if (error instanceof AdminInputError) return fail(error.message, 400);
      console.error('[admin]', error);
      return fail(error instanceof Error ? error.message : '出错了', 500);
    }
  };
}

/** 用户输入不合法 */
export class AdminInputError extends Error {}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AdminInputError('请求内容不是合法的 JSON');
  }
}
