// lib/time.ts —— 按指定时区显示时间（客户端 / 服务端通用，只用浏览器内置的 Intl，无依赖）

const pad = (n: number): string => String(n).padStart(2, '0');

/** 时区名称是否有效；无效时调用方回退到访客本地时区 */
export function isValidTimeZone(timeZone: string | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** 某个时刻在该时区相对 UTC 的偏移（毫秒），自动处理夏令时 */
export function getTimeZoneOffsetMs(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** "UTC+8"、"UTC+5:30"、"UTC-4" */
export function formatUtcOffset(timeZone: string, at: Date = new Date()): string {
  const totalMinutes = Math.round(getTimeZoneOffsetMs(timeZone, at) / 60000);
  const sign = totalMinutes < 0 ? '-' : '+';
  const abs = Math.abs(totalMinutes);
  const minutes = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${minutes ? `:${pad(minutes)}` : ''}`;
}

/** 时钟文本 "HH:mm:ss"；timeZone 为空时用访客本地时区 */
export function formatClock(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(at);
}

/**
 * 把「该时区的墙上时间」解析为时间戳。
 * "2026-03-23T00:00:00" 在 Asia/Singapore 下即新加坡 0 点；字符串自带 Z 或 +08:00 时直接按其偏移解析。
 */
export function parseInTimeZone(value: string, timeZone?: string): number {
  if (!timeZone || /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim())) return Date.parse(value);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(value.trim());
  if (!m) return Date.parse(value);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  // 先按 UTC 猜，再减去该时区在那一刻的偏移；夏令时切换附近再校正一次
  const first = guess - getTimeZoneOffsetMs(timeZone, new Date(guess));
  return guess - getTimeZoneOffsetMs(timeZone, new Date(first));
}
