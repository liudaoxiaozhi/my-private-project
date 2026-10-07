// app/music/musicUtils.ts —— 音乐页的纯函数工具

/** "3:05"；负数显示为 "-3:05"（剩余时间） */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const sign = seconds < 0 ? '-' : '';
  const s = Math.floor(Math.abs(seconds));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
