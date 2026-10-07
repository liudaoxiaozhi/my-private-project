// lib/novel.ts —— 小说书架的读取层（多本书，每本按「卷 → 章」组织），仅服务端 / 构建期使用
//
// 目录结构（详见 novel/README.md）：
//   novel/
//   ├── _shelf.md                    书架分类及顺序
//   ├── chuanyue-mijing/             一本书一个文件夹；文件夹名就是网址里的书号（建议小写英文 + 连字符）
//   │   ├── _book.md                 书的信息：书名、作者、分类、封面、状态；正文是简介
//   │   ├── 01. 第一卷/               卷：开头的数字决定顺序与网址
//   │   │   ├── _volume.md           可选：卷标题 / 卷简介
//   │   │   └── 001. 第一章 ….md      章：开头的数字决定顺序与网址
//   │   └── 02. 第二卷/
//   └── foundation/
//       └── _book.md                 只有 _book.md、没有章节的书是「书单条目」：只展示书目信息，不提供正文
//
// 网址：书页 /novel/<书号>，章节 /novel/<书号>/<卷号>/<章号>，例如 /novel/chuanyue-mijing/01/001。
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
  /** 书号（文件夹名），用于网址 */
  slug: string;
  title: string;
  /** 作者署名；为空时页面不显示署名 */
  author: string;
  publisher: string;
  cover: string;
  status: NovelStatus;
  category: string;
  tags: string[];
  /** 外部链接（书单条目指向豆瓣等页面） */
  link: string;
  /** 简介（Markdown 原文） */
  intro: string;
}

export interface ChapterMeta {
  bookSlug: string;
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

export interface NovelStats {
  chapterCount: number;
  wordCount: number;
  /** 按发布日期最新的一章；都没写日期时取最后一章 */
  latest: ChapterMeta | null;
}

/** 书架卡片用的摘要 */
export interface BookSummary extends NovelBook {
  /** 有章节、可在站内阅读 */
  readable: boolean;
  stats: NovelStats;
}

export interface ShelfCategory {
  name: string;
  books: BookSummary[];
}

// ============================== 内部工具 ==============================

const NOVEL_DIR = path.join(process.cwd(), 'novel');
const VALID_STATUS: readonly NovelStatus[] = ['连载中', '已完结', '暂停更新'];
const UNCATEGORIZED = '未分类';

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
  const cjk = text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g)?.length ?? 0;
  const latin = text.replace(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
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

function listDirs(dir: string): Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return [];
  }
}

// ============================== 书 ==============================

/** 书架上的全部书（按文件夹名排序；分类排序见 getShelf） */
export const getAllBooks = cache((): NovelBook[] =>
  listDirs(NOVEL_DIR)
    .filter((d) => !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d): NovelBook | null => {
      const file = readMd(path.join(NOVEL_DIR, d.name, '_book.md'));
      if (!file) return null;
      const status = asString(file.data.status) as NovelStatus;
      return {
        slug: d.name,
        title: asString(file.data.title) || d.name,
        // 不写 author 字段时默认是站长；写了 author: "" 则不显示署名
        author: 'author' in file.data ? asString(file.data.author) : siteConfig.authorName,
        publisher: asString(file.data.publisher),
        cover: asString(file.data.cover),
        status: VALID_STATUS.includes(status) ? status : '连载中',
        category: asString(file.data.category) || UNCATEGORIZED,
        tags: asStringArray(file.data.tags),
        link: asString(file.data.link),
        intro: file.content.trim(),
      };
    })
    .filter((b): b is NovelBook => b !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug)),
);

export function getBook(bookSlug: string): NovelBook | null {
  return getAllBooks().find((b) => b.slug === bookSlug) ?? null;
}

// ============================== 卷与章 ==============================

interface ChapterRecord extends Chapter {
  draft: boolean;
}

interface VolumeRecord {
  slug: string;
  title: string;
  description: string;
  chapters: ChapterRecord[];
}

/** 读取一本书的全部卷与章（含正文，按卷号、章号排序；draft: true 的章节不发布） */
const readBook = cache((bookSlug: string): VolumeRecord[] => {
  const bookDir = path.join(NOVEL_DIR, bookSlug);
  return listDirs(bookDir)
    .map((dir): VolumeRecord | null => {
      const parsed = splitIndexedName(dir.name);
      if (!parsed) return null;
      const dirPath = path.join(bookDir, dir.name);
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
            bookSlug,
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
    .filter((v): v is VolumeRecord => v !== null && v.chapters.length > 0)
    .sort((a, b) => Number(a.slug) - Number(b.slug));
});

const toMeta = ({ bookSlug, volumeSlug, chapterSlug, title, date, wordCount }: ChapterMeta): ChapterMeta => ({
  bookSlug, volumeSlug, chapterSlug, title, date, wordCount,
});

/** 目录：卷 + 章节摘要（不含正文） */
export const getVolumes = cache((bookSlug: string): Volume[] =>
  readBook(bookSlug).map((v) => ({ slug: v.slug, title: v.title, description: v.description, chapters: v.chapters.map(toMeta) })),
);

/** 全书章节按阅读顺序排成一列 */
const getReadingOrder = cache((bookSlug: string): ChapterMeta[] => getVolumes(bookSlug).flatMap((v) => v.chapters));

export function getChapter(bookSlug: string, volumeSlug: string, chapterSlug: string): Chapter | null {
  const volume = readBook(bookSlug).find((v) => v.slug === volumeSlug);
  const chapter = volume?.chapters.find((c) => c.chapterSlug === chapterSlug);
  if (!chapter) return null;
  const { draft: _draft, ...rest } = chapter;
  return rest;
}

export function getNeighbors(bookSlug: string, volumeSlug: string, chapterSlug: string): ChapterNeighbors {
  const order = getReadingOrder(bookSlug);
  const i = order.findIndex((c) => c.volumeSlug === volumeSlug && c.chapterSlug === chapterSlug);
  return { prev: i > 0 ? order[i - 1] : null, next: i >= 0 && i < order.length - 1 ? order[i + 1] : null, position: i + 1, total: order.length };
}

export const getNovelStats = cache((bookSlug: string): NovelStats => {
  const order = getReadingOrder(bookSlug);
  const dated = order.filter((c) => toTimestamp(c.date) > 0);
  const latest = dated.length > 0
    ? dated.reduce((a, b) => (toTimestamp(b.date) >= toTimestamp(a.date) ? b : a))
    : order[order.length - 1] ?? null;
  return { chapterCount: order.length, wordCount: order.reduce((sum, c) => sum + c.wordCount, 0), latest };
});

/** 全站所有可阅读章节（生成静态页面 / 站点地图用） */
export const getAllChapters = cache((): ChapterMeta[] => getAllBooks().flatMap((b) => getReadingOrder(b.slug)));

// ============================== 书架 ==============================

/** 按 _shelf.md 的分类顺序分组；同一分类里可阅读的书排在书单条目前面 */
export const getShelf = cache((): ShelfCategory[] => {
  const order = asStringArray(readMd(path.join(NOVEL_DIR, '_shelf.md'))?.data.categories);
  const groups = new Map<string, BookSummary[]>();
  for (const book of getAllBooks()) {
    const stats = getNovelStats(book.slug);
    const list = groups.get(book.category) ?? [];
    list.push({ ...book, readable: stats.chapterCount > 0, stats });
    groups.set(book.category, list);
  }
  const rank = (name: string): number => {
    const i = order.indexOf(name);
    return i === -1 ? order.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, books]) => ({
      name,
      books: books.sort((a, b) => Number(b.readable) - Number(a.readable)),
    }));
});

// ============================== 网址与格式 ==============================

export const bookHref = (bookSlug: string): string => `/novel/${encodeURIComponent(bookSlug)}`;

export const chapterHref = (c: Pick<ChapterMeta, 'bookSlug' | 'volumeSlug' | 'chapterSlug'>): string =>
  `${bookHref(c.bookSlug)}/${encodeURIComponent(c.volumeSlug)}/${encodeURIComponent(c.chapterSlug)}`;

/** 12345 → "1.2 万"；不足一万显示原数（带千分位） */
export function formatWordCount(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万` : n.toLocaleString('en-US');
}
