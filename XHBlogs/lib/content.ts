// lib/content.ts —— 文章（posts/）与杂谈（chatters/）的统一读取层
//
// 仅在服务端使用（依赖 fs）：Server Component、generateMetadata、generateStaticParams。
// 不要在 'use client' 组件里 import；需要传给客户端组件时，只传 *Meta 摘要类型，别带 content 全文。
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { cache } from 'react';

// ============================== 类型 ==============================

/** 文章摘要：列表、搜索、轮播、推荐等场景使用（不含正文，避免把全文塞进客户端 payload） */
export interface PostMeta {
  slug: string;
  /** 已兜底为「无标题」 */
  title: string;
  /** 统一为 "YYYY-MM-DD HH:mm:ss" 或 "YYYY-MM-DD"；缺失时为空字符串 */
  date: string;
  description: string;
  tags: string[];
  /** frontmatter 原始封面；未填写时为空字符串，由调用方决定默认图 */
  cover: string;
}

/** 文章全文 */
export interface Post extends PostMeta {
  /** 去掉 frontmatter 后的 Markdown 原文 */
  content: string;
}

/** 杂谈摘要 */
export interface ChatterMeta {
  slug: string;
  /** 原始标题，可能为空（杂谈墙上无标题卡片会隐藏标题区） */
  title: string;
  date: string;
  description: string;
  /** description 为空时，从正文截取的纯文本摘要 */
  excerpt: string;
  tags: string[];
  mood: string;
  cover: string;
}

export interface Chatter extends ChatterMeta {
  content: string;
}

/** 首页轮播卡片（文章 / 杂谈共用）：只含展示所需字段 */
export interface CardItem {
  slug: string;
  title: string;
  description: string;
  cover: string;
  date: string;
  /** 已格式化的展示日期，如 "2026.03.24 07:00" */
  formattedDate: string;
}

/** 说说 */
export interface Moment {
  id: string;
  date: string;
  location: string;
  images: string[];
  content: string;
}

export interface TagStat {
  name: string;
  count: number;
}

// ============================== 内部工具 ==============================

const CONTENT_ROOT = process.cwd();
const POSTS_DIR = path.join(CONTENT_ROOT, 'posts');
const CHATTERS_DIR = path.join(CONTENT_ROOT, 'chatters');

/** slug 只能是文件名本身，拒绝 ../ 等路径穿越 */
const SAFE_SLUG = /^[^/\\]+$/;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * frontmatter 的 date 可能是字符串，也可能被 YAML 解析成 Date（未加引号的 2026-03-24）。
 * 统一转成字符串：直接把 Date 放进 JSX 会触发 "Objects are not valid as a React child"。
 */
export function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // YAML 日期按 UTC 解析，这里按 UTC 取字段，避免时区把日期推到前一天
    const ymd = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    const s = value.getUTCSeconds();
    return h || m || s ? `${ymd} ${pad(h)}:${pad(m)}:${pad(s)}` : ymd;
  }
  return typeof value === 'string' ? value.trim() : '';
}

/** 排序用时间戳；无法解析的日期排到最后 */
export function toTimestamp(date: string): number {
  if (!date) return 0;
  const t = new Date(date.replace(' ', 'T')).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 展示用日期："2026-03-24 07:00:45" → "2026.03.24 07:00"；零点只显示日期。
 * 纯字符串处理，不经过 Date，服务端与客户端、不同时区结果一致（无 Hydration 风险）。
 */
export function formatDisplayDate(date: string, emptyText = '刚刚更新'): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(date);
  if (!m) return date || emptyText;
  if (m[1] === '1970') return emptyText;
  const ymd = `${m[1]}.${pad(Number(m[2]))}.${pad(Number(m[3]))}`;
  const hasTime = m[4] !== undefined && !(Number(m[4]) === 0 && m[5] === '00');
  return hasTime ? `${ymd} ${pad(Number(m[4]))}:${m[5]}` : ymd;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
}

/** 新的在前；同一时间按 slug 倒序，保证顺序稳定 */
function byDateDesc<T extends { date: string; slug: string }>(a: T, b: T): number {
  const diff = toTimestamp(b.date) - toTimestamp(a.date);
  return diff !== 0 ? diff : b.slug.localeCompare(a.slug);
}

function listMarkdownSlugs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.slice(0, -3));
  } catch {
    return [];
  }
}

function readMarkdown(dir: string, slug: string): { data: Record<string, unknown>; content: string } | null {
  if (!SAFE_SLUG.test(slug)) return null;
  const fullPath = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(fullPath)) return null;
  const { data, content } = matter(fs.readFileSync(fullPath, 'utf8'));
  return { data: data as Record<string, unknown>, content };
}

/** 去掉 Markdown 语法，得到适合做摘要的纯文本 */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~`|]/g, ' ')
    .replace(/\$+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================== 文章 ==============================

function toPost(slug: string, data: Record<string, unknown>, content: string): Post {
  return {
    slug,
    title: asString(data.title) || '无标题',
    date: normalizeDate(data.date),
    description: asString(data.description),
    tags: asStringArray(data.tags),
    cover: asString(data.cover),
    content,
  };
}

const stripContent = ({ content: _content, ...meta }: Post): PostMeta => meta;

export function getPostSlugs(): string[] {
  return listMarkdownSlugs(POSTS_DIR);
}

/** 读取单篇文章；不存在或 slug 非法时返回 null（调用方配合 notFound()） */
export const getPostBySlug = cache((slug: string): Post | null => {
  const file = readMarkdown(POSTS_DIR, slug);
  return file ? toPost(slug, file.data, file.content) : null;
});

/** 全部文章（含正文），按日期倒序。同一次渲染内多处调用只读一次磁盘 */
const getAllPostsWithContent = cache((): Post[] =>
  getPostSlugs()
    .map((slug) => getPostBySlug(slug))
    .filter((post): post is Post => post !== null)
    .sort(byDateDesc),
);

/** 全部文章摘要，按日期倒序 */
export const getAllPosts = cache((): PostMeta[] => getAllPostsWithContent().map(stripContent));

/** 最新文章（推荐位），排除当前篇 */
export function getRecentPosts(excludeSlug: string, limit = 3): PostMeta[] {
  return getAllPosts()
    .filter((post) => post.slug !== excludeSlug)
    .slice(0, limit);
}

/** 标签统计；没有标签的文章计入 fallbackTag */
export function getTagStats(posts: readonly PostMeta[], fallbackTag = '未分类'): TagStat[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const tags = post.tags.length > 0 ? post.tags : [fallbackTag];
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ============================== 杂谈 ==============================

const EXCERPT_LENGTH = 60;

function toChatter(slug: string, data: Record<string, unknown>, content: string): Chatter {
  const description = asString(data.description);
  return {
    slug,
    title: asString(data.title),
    date: normalizeDate(data.date),
    description,
    excerpt: description || toPlainText(content).slice(0, EXCERPT_LENGTH),
    tags: asStringArray(data.tags),
    mood: asString(data.mood),
    cover: asString(data.cover),
    content,
  };
}

export function getChatterSlugs(): string[] {
  return listMarkdownSlugs(CHATTERS_DIR);
}

export const getChatterBySlug = cache((slug: string): Chatter | null => {
  const file = readMarkdown(CHATTERS_DIR, slug);
  return file ? toChatter(slug, file.data, file.content) : null;
});

/** 全部杂谈（含正文，杂谈墙需要正文做搜索与预览），按日期倒序 */
export const getAllChatters = cache((): Chatter[] =>
  getChatterSlugs()
    .map((slug) => getChatterBySlug(slug))
    .filter((chatter): chatter is Chatter => chatter !== null)
    .sort(byDateDesc),
);

export function getRecentChatters(excludeSlug: string, limit = 3): ChatterMeta[] {
  return getAllChatters()
    .filter((chatter) => chatter.slug !== excludeSlug)
    .slice(0, limit)
    .map(({ content: _content, ...meta }) => meta);
}

// ============================== 说说 ==============================

/** 说说可能放在 moments/ 或旧位置 posts/moments/，两处都扫描，同名以 moments/ 为准 */
const MOMENT_DIRS = [path.join(CONTENT_ROOT, 'posts', 'moments'), path.join(CONTENT_ROOT, 'moments')];

export const getAllMoments = cache((): Moment[] => {
  const byId = new Map<string, Moment>();
  for (const dir of MOMENT_DIRS) {
    for (const id of listMarkdownSlugs(dir)) {
      const file = readMarkdown(dir, id);
      if (!file) continue;
      byId.set(id, {
        id,
        date: normalizeDate(file.data.date) || '1970-01-01',
        location: asString(file.data.location),
        images: asStringArray(file.data.images),
        content: file.content.trim(),
      });
    }
  }
  return [...byId.values()];
});
