// lib/novelProgress.ts —— 小说阅读进度与阅读器设置（只存在读者自己的浏览器里）
//
// 隐私模式或禁用存储时读写会失败，这里全部吞掉错误，阅读功能不受影响。

export interface NovelProgress {
  /** 章节网址，例如 /novel/01/003 */
  href: string;
  title: string;
  volumeTitle: string;
  /** 本章已读比例 0~1 */
  ratio: number;
  savedAt: number;
}

export type ReaderTheme = 'paper' | 'sepia' | 'green' | 'night';
export type ReaderFont = 'serif' | 'sans';

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  font: ReaderFont;
  theme: ReaderTheme;
}

const PROGRESS_KEY = 'novel-progress';
const SETTINGS_KEY = 'novel-reader-settings';

export const FONT_SIZES = [16, 18, 20, 22, 24, 26] as const;
export const LINE_HEIGHTS = [1.7, 1.9, 2.1] as const;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时忽略 */
  }
}

export function loadProgress(): NovelProgress | null {
  const p = read<NovelProgress>(PROGRESS_KEY);
  return p && typeof p.href === 'string' && typeof p.ratio === 'number' ? p : null;
}

export const saveProgress = (p: NovelProgress): void => write(PROGRESS_KEY, p);

export function loadSettings(): Partial<ReaderSettings> | null {
  return read<Partial<ReaderSettings>>(SETTINGS_KEY);
}

export const saveSettings = (s: ReaderSettings): void => write(SETTINGS_KEY, s);
