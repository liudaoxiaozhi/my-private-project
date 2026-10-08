// lib/articleReader.ts —— 文章阅读设置与阅读位置（只存在读者自己的浏览器里）
//
// 设置通过 CSS 变量作用在正文容器上（样式见 app/article.css）。
// articleSettingsScript 在正文之后内联执行，首屏绘制前就套用设置，不会先闪一下默认字号。
import { readJSON, removeKey, writeJSON } from './localStore';
import type { ReaderFont } from './novelProgress';

/** 正文容器 id（文章页、杂谈页共用） */
export const ARTICLE_CONTENT_ID = 'article-content';
/** 正文 + 侧栏的外层容器（专注模式隐藏侧栏） */
export const ARTICLE_LAYOUT_CLASS = 'article-layout';

export interface ArticleSettings {
  /** 字号倍率 */
  scale: number;
  /** 行距 */
  leading: number;
  font: ReaderFont;
  /** 专注模式：隐藏侧栏 */
  focus: boolean;
}

export const ARTICLE_SCALES = [0.875, 0.9375, 1, 1.0625, 1.125, 1.25] as const;
export const ARTICLE_LEADINGS = [1.65, 1.85, 2.05] as const;
export const DEFAULT_ARTICLE_SETTINGS: ArticleSettings = { scale: 1, leading: 1.85, font: 'serif', focus: false };

const SETTINGS_KEY = 'article-reader-settings';

/**
 * 把设置写到页面上。会被 toString() 内联进首屏脚本，所以函数体必须自给自足：
 * 不能引用外部变量，也要自己校验数据（本地存储里的值可能被改坏）。
 */
function applySettingsToDom(s: Partial<ArticleSettings>, contentId: string, layoutClass: string): void {
  const content = document.getElementById(contentId);
  if (content) {
    const style = content.style;
    const scale = typeof s.scale === 'number' && s.scale >= 0.75 && s.scale <= 1.5 ? s.scale : 1;
    const leading = typeof s.leading === 'number' && s.leading >= 1.4 && s.leading <= 2.4 ? s.leading : 0;
    if (scale !== 1) style.setProperty('--ap-scale', String(scale));
    else style.removeProperty('--ap-scale');
    // 「适中」不写变量，沿用样式表里手机 / 电脑各自的默认行距
    if (leading && leading !== 1.85) style.setProperty('--ap-leading', String(leading));
    else style.removeProperty('--ap-leading');
    if (s.font === 'sans') style.setProperty('--ap-font', 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif');
    else style.removeProperty('--ap-font');
  }
  const layout = document.querySelector('.' + layoutClass);
  if (layout) layout.setAttribute('data-focus', s.focus === true ? 'true' : 'false');
}

export function applyArticleSettings(s: ArticleSettings): void {
  applySettingsToDom(s, ARTICLE_CONTENT_ID, ARTICLE_LAYOUT_CLASS);
}

export const articleSettingsScript = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||'null');if(s&&typeof s==='object')(${applySettingsToDom.toString()})(s,${JSON.stringify(ARTICLE_CONTENT_ID)},${JSON.stringify(ARTICLE_LAYOUT_CLASS)})}catch(e){}`;

function nearest(list: readonly number[], value: unknown, fallback: number): number {
  if (typeof value !== 'number') return fallback;
  return list.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), fallback);
}

function normalizeSettings(saved: Partial<ArticleSettings> | null): ArticleSettings {
  return {
    scale: nearest(ARTICLE_SCALES, saved?.scale, DEFAULT_ARTICLE_SETTINGS.scale),
    leading: nearest(ARTICLE_LEADINGS, saved?.leading, DEFAULT_ARTICLE_SETTINGS.leading),
    font: saved?.font === 'sans' ? 'sans' : 'serif',
    focus: saved?.focus === true,
  };
}

// —— 设置做成一个小 store，配合 useSyncExternalStore 使用；其他标签页改了设置也会同步 ——

const SETTINGS_EVENT = 'article-settings-change';
/** 存储不可用（隐私模式）时退回内存，本次浏览仍然有效 */
let memorySettings: ArticleSettings | null = null;
let cachedRaw: string | null | undefined;
let cachedSettings: ArticleSettings = DEFAULT_ARTICLE_SETTINGS;

export function getArticleSettings(): ArticleSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    /* 存储不可用 */
  }
  if (raw === null) return memorySettings ?? DEFAULT_ARTICLE_SETTINGS;
  // 返回值必须保持引用稳定：内容没变就返回同一个对象
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    let parsed: Partial<ArticleSettings> | null = null;
    try {
      parsed = JSON.parse(raw) as Partial<ArticleSettings>;
    } catch {
      /* 数据损坏时用默认值 */
    }
    cachedSettings = normalizeSettings(parsed);
  }
  return cachedSettings;
}

export function subscribeArticleSettings(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(SETTINGS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SETTINGS_EVENT, onChange);
  };
}

export function saveArticleSettings(s: ArticleSettings): void {
  memorySettings = s;
  writeJSON(SETTINGS_KEY, s);
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

// ============================== 阅读位置 ==============================

export interface ReadingPosition {
  /** 已读比例 0~1 */
  ratio: number;
  savedAt: number;
}

/** 超过这么久的阅读位置不再提示 */
const POSITION_TTL = 60 * 24 * 60 * 60 * 1000;

const positionKey = (key: string): string => `article-position:${key}`;

export function loadPosition(key: string): ReadingPosition | null {
  const p = readJSON<ReadingPosition>(positionKey(key));
  if (!p || typeof p.ratio !== 'number' || typeof p.savedAt !== 'number') return null;
  return Date.now() - p.savedAt < POSITION_TTL ? p : null;
}

export const savePosition = (key: string, ratio: number): void =>
  writeJSON(positionKey(key), { ratio, savedAt: Date.now() } satisfies ReadingPosition);

export const clearPosition = (key: string): void => removeKey(positionKey(key));
