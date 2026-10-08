// lib/omikuji.ts —— 今日御神签：每位读者每天一支，同一天反复打开结果不变（只存在读者自己的浏览器里）
//
// 结果 = 读者的随机种子 + 当天日期 → 伪随机，所以不需要把整支签存下来，只记「哪天抽过、凶签有没有系上」。
import {
  OMIKUJI_CATEGORIES,
  OMIKUJI_DO,
  OMIKUJI_DONT,
  OMIKUJI_LEVELS,
  OMIKUJI_LINES,
  OMIKUJI_LUCKY_COLORS,
  OMIKUJI_LUCKY_ITEMS,
} from '../data/omikuji';
import type { OmikujiLevel } from '../data/omikuji';

export interface OmikujiResult {
  /** 签号 1~100 */
  number: number;
  level: OmikujiLevel;
  verse: [string, string];
  comment: string;
  categories: Array<{ name: string; text: string }>;
  good: string[];
  bad: string[];
  item: string;
  color: string;
}

interface Saved {
  date: string;
  seed: number;
  /** 凶签已经系在樱花枝上 */
  tied: boolean;
}

const KEY = 'omikuji';
const CHANGE_EVENT = 'omikuji-change';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

/** 不重复地取 count 个 */
function pickMany<T>(list: readonly T[], count: number, rand: () => number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

export function drawOmikuji(seed: number, date: string): OmikujiResult {
  const rand = mulberry32(hash(`${seed}|${date}`));
  const total = OMIKUJI_LEVELS.reduce((s, l) => s + l.weight, 0);
  let roll = rand() * total;
  const level = OMIKUJI_LEVELS.find((l) => (roll -= l.weight) < 0) ?? OMIKUJI_LEVELS[OMIKUJI_LEVELS.length - 1];

  // 分项大体跟着签的好坏走，偶尔有一项例外，读起来更像真的签
  const categories = OMIKUJI_CATEGORIES.map((name) => {
    const r = rand();
    const tone = r < 0.7 ? level.tone : r < 0.85 ? 'fair' : level.tone === 'bad' ? 'fair' : 'good';
    return { name, text: pickFrom(OMIKUJI_LINES[name][tone], rand) };
  });

  return {
    number: 1 + Math.floor(rand() * 100),
    level,
    verse: pickFrom(level.verses, rand),
    comment: pickFrom(level.comments, rand),
    categories,
    good: pickMany(OMIKUJI_DO, 2, rand),
    bad: pickMany(OMIKUJI_DONT, 2, rand),
    item: pickFrom(OMIKUJI_LUCKY_ITEMS, rand),
    color: pickFrom(OMIKUJI_LUCKY_COLORS, rand),
  };
}

const CN_DIGITS = '〇一二三四五六七八九';

/** 签号写成汉字：23 → 二十三 */
export function toChineseNumber(n: number): string {
  if (n === 100) return '百';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensText = tens === 0 ? '' : tens === 1 ? '十' : `${CN_DIGITS[tens]}十`;
  return tensText + (ones === 0 && tens > 0 ? '' : CN_DIGITS[ones]);
}

// —— 存储：给 useSyncExternalStore 用 ——

let cachedRaw: string | null | undefined;
let cachedSaved: Saved | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** 今天抽过的签（没抽过、或者是昨天的记录时返回 null） */
export function getTodayOmikuji(): Saved | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = JSON.parse(raw || 'null') as Partial<Saved> | null;
      cachedSaved = parsed && typeof parsed.seed === 'number' && typeof parsed.date === 'string' ? { date: parsed.date, seed: parsed.seed, tied: parsed.tied === true } : null;
    } catch {
      cachedSaved = null;
    }
  }
  return cachedSaved && cachedSaved.date === todayKey() ? cachedSaved : null;
}

export function subscribeOmikuji(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function save(next: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 存储不可用：至少本次浏览内有效
    cachedRaw = JSON.stringify(next);
    cachedSaved = next;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 抽签：沿用读者固定的种子（第一次抽时生成），所以同一天怎么抽都是同一支 */
export function drawToday(): OmikujiResult {
  const previous = (() => {
    try {
      return JSON.parse(readRaw() || 'null') as Partial<Saved> | null;
    } catch {
      return null;
    }
  })();
  const seed = typeof previous?.seed === 'number' ? previous.seed : Math.floor(Math.random() * 2 ** 31);
  const date = todayKey();
  save({ date, seed, tied: false });
  return drawOmikuji(seed, date);
}

export function tieToday(): void {
  const today = getTodayOmikuji();
  if (today) save({ ...today, tied: true });
}

export function resultOf(saved: Saved): OmikujiResult {
  return drawOmikuji(saved.seed, saved.date);
}

/** 用于复制分享的纯文本 */
export function omikujiText(r: OmikujiResult): string {
  return [
    `🎋 今日御神签 · 第${toChineseNumber(r.number)}番 · ${r.level.name}`,
    `「${r.verse[0]}，${r.verse[1]}」`,
    ...r.categories.map((c) => `${c.name}：${c.text}`),
    `宜：${r.good.join('、')}　忌：${r.bad.join('、')}`,
    `幸运物：${r.item}　幸运色：${r.color}`,
  ].join('\n');
}
