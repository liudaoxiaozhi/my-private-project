// lib/novel.ts —— 小说（一本书，按「卷 → 章」组织）的读取层，仅服务端 / 构建期使用
//
// 目录结构（详见 novel/README.md）：
//   novel/
//   ├── _book.md                 书的信息：书名、封面、状态等；正文是简介
//   ├── 01. 第一卷 初醒/          卷：开头的数字决定顺序与网址
//   │   ├── _volume.md           可选：卷标题 / 卷简介
//   │   ├── 001. 第一章 醒来.md   章：开头的数字决定顺序与网址
//   │   └── 002. 第二章 ….md
//   └── 02. 第二卷 …/
//
// 章节网址：/novel/<卷号>/<章号>，例如 /novel/01/001。重命名标题不影响网址，改数字才会变。
import fs from 'fs';
import type { Dirent } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { cache } from 'react';
import { siteConfig } from '../siteConfig';
import { normalizeDate, toPlainText, toTimestamp } from './content';

// ============================== 类型 ==============================

export type NovelStatus = '连载中' | '已完结' | '暂停更新';

export interface NovelBook {
  title: string;
  author: string;
  cover: string;
  status: NovelStatus;
  tags: string[];
  /** 简介（Markdown 原文） */
  intro: string;
}

export interface ChapterMeta {
  /** 卷号，例如 "01" */
  volumeSlug: string;
  /** 章号，例如 "001" */
  chapterSlug: string;
  title: string;
  /** 发布日期，"YYYY-MM-DD HH:mm:ss" 或 "YYYY-MM-DD"；未填写时为空 */
  date: string;
  /** 字数（中文按字、英文按词） */
  wordCount: number;
}

export interface Chapter extends ChapterMeta {
  volumeTitle: string;
  /** 正文 Markdown */
  content: string;
}

export interface Volume {
  slug: string;
  title: string;
  description: string;
  chapters: ChapterMeta[];
}

export interface ChapterNeighbors {
  prev: ChapterMeta | null;
  next: ChapterMeta | null;
  /** 在全书中的序号（从 1 开始）与总章数 */
  position: number;
  total: number;
}

// ============================== 内部工具 ==============================

const NOVEL_DIR = path.join(process.cwd(), 'novel');
const VALID_STATUS: readonly NovelStatus[] = ['连载中', '已完结', '暂停更新'];

/** "01. 第一卷 初醒" → { slug: "01", title: "第一卷 初醒" }；没有数字前缀时返回 null（不参与展示） */
function splitIndexedName(name: string): { slug: string; title: string } | null {
  const m = /^(\d{1,4})[.、_\-\s]*(.*)$/.exec(name);
  if (!m) return null;
  return { slug: m[1], title: m[2].trim() };
}

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];

/** 中文按字计数，英文 / 数字按词计数，和常见写作软件的口径一致 */
export function countWords(markdown: string): number {
  const text = toPlainText(markdown);
  const cjk = text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g)?.length ?? 0;
  const latin = text.replace(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + latin;
}

function readMd(file: string): { data: Record<string, unknown>; content: string } | null {
  try {
    const { data, content } = matter(fs.readFileSync(file, 'utf8'));
    return { data: data as Record<string, unknown>, content };
  } catch {
    return null;
  }
}

const byNumber = (a: { slug: string }, b: { slug: string }): number => Number(a.slug) - Number(b.slug);

// ============================== 读取 ==============================

/** 书的信息；没有 novel/_book.md 时返回 null（小说栏目显示「还没有开始写」） */
export const getBook = cache((): NovelBook | null => {
  const file = readMd(path.join(NOVEL_DIR, '_book.md'));
  if (!file) return null;
  const status = asString(file.data.status) as NovelStatus;
  return {
    title: asString(file.data.title) || '未命名小说',
    // 不写 author 字段时默认是站长；写了 author: "" 则不显示署名（例如替朋友发布、笔名待定）
    author: 'author' in file.data ? asString(file.data.author) : siteConfig.authorName,
    cover: asString(file.data.cover),
    status: VALID_STATUS.includes(status) ? status : '连载中',
    tags: asStringArray(file.data.tags),
    intro: file.content.trim(),
  };
});

interface ChapterRecord extends Chapter {
  draft: boolean;
}

/** 读取全部卷与章（含正文，按卷号、章号排序；draft: true 的章节不发布） */
const readAll = cache((): Array<{ slug: string; title: string; description: string; chapters: ChapterRecord[] }> => {
  let entries: Dirent[] = [];
  try {
    entries = fs.readdirSync(NOVEL_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isDirectory())
    .map((dir) => {
      const parsed = splitIndexedName(dir.name);
      if (!parsed) return null;
      const dirPath = path.join(NOVEL_DIR, dir.name);
      const meta = readMd(path.join(dirPath, '_volume.md'));
      const volumeTitle = asString(meta?.data.title) || parsed.title || `第 ${Number(parsed.slug)} 卷`;

      const chapters = fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
        .map((f): ChapterRecord | null => {
          const idx = splitIndexedName(f.slice(0, -3));
          const file = idx ? readMd(path.join(dirPath, f)) : null;
          if (!idx || !file) return null;
          return {
            volumeSlug: parsed.slug,
            chapterSlug: idx.slug,
            volumeTitle,
            title: asString(file.data.title) || idx.title || `第 ${Number(idx.slug)} 章`,
            date: normalizeDate(file.data.date),
            wordCount: countWords(file.content),
            content: file.content,
            draft: file.data.draft === true,
          };
        })
        .filter((c): c is ChapterRecord => c !== null && !c.draft)
        .sort((a, b) => Number(a.chapterSlug) - Number(b.chapterSlug));

      return { slug: parsed.slug, title: volumeTitle, description: meta?.content.trim() || asString(meta?.data.description), chapters };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null && v.chapters.length > 0)
    .sort(byNumber);
});

const toMeta = ({ volumeSlug, chapterSlug, title, date, wordCount }: ChapterMeta): ChapterMeta => ({
  volumeSlug, chapterSlug, title, date, wordCount,
});

/** 目录：卷 + 章节摘要（不含正文） */
export const getVolumes = cache((): Volume[] =>
  readAll().map((v) => ({ slug: v.slug, title: v.title, description: v.description, chapters: v.chapters.map(toMeta) })),
);

/** 全书章节按阅读顺序排成一列 */
const getReadingOrder = cache((): ChapterMeta[] => getVolumes().flatMap((v) => v.chapters));

export function getChapter(volumeSlug: string, chapterSlug: string): Chapter | null {
  const volume = readAll().find((v) => v.slug === volumeSlug);
  const chapter = volume?.chapters.find((c) => c.chapterSlug === chapterSlug);
  if (!chapter) return null;
  const { draft: _draft, ...rest } = chapter;
  return rest;
}

export function getNeighbors(volumeSlug: string, chapterSlug: string): ChapterNeighbors {
  const order = getReadingOrder();
  const i = order.findIndex((c) => c.volumeSlug === volumeSlug && c.chapterSlug === chapterSlug);
  return { prev: i > 0 ? order[i - 1] : null, next: i >= 0 && i < order.length - 1 ? order[i + 1] : null, position: i + 1, total: order.length };
}

export interface NovelStats {
  chapterCount: number;
  wordCount: number;
  /** 按发布日期最新的一章（公众号式「最近更新」）；都没写日期时取最后一章 */
  latest: ChapterMeta | null;
}

export const getNovelStats = cache((): NovelStats => {
  const order = getReadingOrder();
  const dated = order.filter((c) => toTimestamp(c.date) > 0);
  const latest = dated.length > 0
    ? dated.reduce((a, b) => (toTimestamp(b.date) >= toTimestamp(a.date) ? b : a))
    : order[order.length - 1] ?? null;
  return { chapterCount: order.length, wordCount: order.reduce((sum, c) => sum + c.wordCount, 0), latest };
});

export const chapterHref = (c: Pick<ChapterMeta, 'volumeSlug' | 'chapterSlug'>): string =>
  `/novel/${encodeURIComponent(c.volumeSlug)}/${encodeURIComponent(c.chapterSlug)}`;

/** 12345 → "1.2 万"；不足一万显示原数（带千分位） */
export function formatWordCount(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万` : n.toLocaleString('en-US');
}
