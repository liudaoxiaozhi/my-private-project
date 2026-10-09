// lib/server/admin/auth.ts —— 网页后台（/admin）的登录：一个管理员密码 + 签名 Cookie（仅服务端）
//
// - 密码来自环境变量 ADMIN_PASSWORD；没配置时后台整个不可用（接口返回 503），不会出现「默认密码」
// - 登录成功后发一个 httpOnly Cookie：内容是过期时间 + HMAC 签名，服务端不用存会话
// - 签名密钥：ADMIN_SESSION_SECRET；没配置时由密码派生，所以改了密码，所有已登录的设备都会被登出
// - 改动类接口另外要求同源 + 自定义请求头 X-Admin（见 api.ts 的 guard），防止其他网站借 Cookie 发请求
import crypto from 'crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'xh_admin';
/** 登录有效期：7 天 */
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function adminPassword(): string {
  return (process.env.ADMIN_PASSWORD ?? '').trim();
}

export const isAdminConfigured = (): boolean => adminPassword() !== '';

function secret(): Buffer {
  const explicit = (process.env.ADMIN_SESSION_SECRET ?? '').trim();
  return crypto.createHash('sha256').update(explicit || `xhblogs-admin:${adminPassword()}`).digest();
}

const sign = (payload: string): string => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** 比对密码（先各自哈希成等长再比，长度不同也不提前返回） */
export function checkPassword(input: string): boolean {
  const expected = adminPassword();
  if (!expected) return false;
  const digest = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
  return safeEqual(digest(input), digest(expected));
}

export function createSessionToken(now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_MAX_AGE * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !isAdminConfigured()) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}

export async function isLoggedIn(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function startSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
