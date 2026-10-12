// lib/server/animeClean.ts —— 书影音数据清洗用的小工具与错误类型（animeStore / tmdb 共用）

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function int(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function date(value: unknown): string {
  const s = str(value, 10);
  return DATE_RE.test(s) ? s : '';
}

/** 封面只接受站内路径或 http(s) 外链，挡掉 javascript: 之类 */
export function cover(value: unknown): string {
  const s = str(value, 1000);
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const url = new URL(s);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** 带 HTTP 状态码的业务错误，接口层直接把 message 返回给页面 */
export class AnimeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
