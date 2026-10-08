// lib/novelProgress.ts —— 小说阅读进度与阅读器设置（只存在读者自己的浏览器里）
//
// 隐私模式或禁用存储时读写会失败，这里全部吞掉错误，阅读功能不受影响。

import { readJSON as read, writeJSON as write } from './localStore';

export interface NovelProgress {
  /** 章节网址，例如 /novel/chuanyue-mijing/01/003 */
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

/** 每本书单独记录进度：novel-progress:<书号> */
const progressKey = (bookSlug: string): string => `novel-progress:${bookSlug}`;
const SETTINGS_KEY = 'novel-reader-settings';

export const FONT_SIZES = [16, 18, 20, 22, 24, 26] as const;
export const LINE_HEIGHTS = [1.7, 1.9, 2.1] as const;

export function loadProgress(bookSlug: string): NovelProgress | null {
  const p = read<NovelProgress>(progressKey(bookSlug));
  return p && typeof p.href === 'string' && typeof p.ratio === 'number' ? p : null;
}

export const saveProgress = (bookSlug: string, p: NovelProgress): void => write(progressKey(bookSlug), p);

export function loadSettings(): Partial<ReaderSettings> | null {
  return read<Partial<ReaderSettings>>(SETTINGS_KEY);
}

export const saveSettings = (s: ReaderSettings): void => write(SETTINGS_KEY, s);
