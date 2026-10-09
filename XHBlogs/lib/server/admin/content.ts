// lib/server/admin/content.ts —— 后台的 Markdown 内容：文章、杂谈、说说、关于我（仅服务端）
//
// 文件格式和网站读取的一样（lib/content.ts）：frontmatter + 正文。保存时保留原文件里后台没有管到的 frontmatter 字段。
import matter from 'gray-matter';
import { AdminInputError } from './api';
import { getStorage } from './storage';
import type { Change } from './storage';

export type ContentKind = 'posts' | 'chatters' | 'moments' | 'about';

export const CONTENT_KINDS: ContentKind[] = ['posts', 'chatters', 'moments', 'about'];
export const CONTENT_LABEL: Record<ContentKind, string> = { posts: '文章', chatters: '杂谈', moments: '说说', about: '关于我' };

const ABOUT_PATH = 'app/about/about.md';
const ABOUT_SLUG = 'about';

export interface ContentSummary {
  slug: string;
  title: string;
  date: string;
  /** 说说没有标题，用正文开头代替 */
  excerpt: string;
  tags: string[];
  cover: string;
}

export interface ContentDoc {
  slug: string;
  data: Record<string, unknown>;
  body: string;
}

/** 附件：上传时暂存的文件，随这次保存一起提交 */
export interface Attachment {
  path: string;
  staged: string;
}

export function isContentKind(value: string): value is ContentKind {
  return (CONTENT_KINDS as string[]).includes(value);
}

/** 文件名（slug）里不能有的字符：路径分隔符、Windows 保留字符、会破坏网址的 # ? % */
const BAD_SLUG = /[\\/:*?"<>|#%\u0000-\u001f]/;

export function assertSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed || trimmed.length > 120 || BAD_SLUG.test(trimmed) || trimmed.startsWith('.')) {
    throw new AdminInputError('文件名不合法：不能为空，不能含 / \\ : * ? " < > | # %，也不能以 . 开头');
  }
  return trimmed;
}

const fileOf = (kind: ContentKind, slug: string): string => (kind === 'about' ? ABOUT_PATH : `${kind}/${assertSlug(slug)}.md`);

/** frontmatter 的日期可能被 YAML 解析成 Date，统一转回字符串 */
function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19).replace(/ 00:00:00$/, '');
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

function parse(slug: string, raw: string): ContentDoc {
  const { data, content } = matter(raw);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) out[key] = plain(value);
  return { slug, data: out, body: content.replace(/^\n+/, '') };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

export async function listContent(kind: ContentKind): Promise<ContentSummary[]> {
  const storage = getStorage();
  if (kind === 'about') {
    const raw = await storage.readText(ABOUT_PATH);
    const doc = parse(ABOUT_SLUG, raw ?? '');
    return [{ slug: ABOUT_SLUG, title: str(doc.data.title) || '关于我', date: str(doc.data.date), excerpt: doc.body.slice(0, 80), tags: [], cover: str(doc.data.cover) }];
  }
  const files = (await storage.list(kind)).filter((f) => f.type === 'file' && f.name.endsWith('.md'));
  const docs = await mapLimit(files, 8, async (f) => {
    const raw = await storage.readText(f.path);
    return raw === null ? null : parse(f.name.slice(0, -3), raw);
  });
  return docs
    .filter((d): d is ContentDoc => d !== null)
    .map((d) => ({
      slug: d.slug,
      title: str(d.data.title),
      date: str(d.data.date),
      excerpt: d.body.replace(/\s+/g, ' ').trim().slice(0, 80),
      tags: Array.isArray(d.data.tags) ? d.data.tags.map(str).filter(Boolean) : [],
      cover: str(d.data.cover),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
}

export async function getContent(kind: ContentKind, slug: string): Promise<ContentDoc | null> {
  const raw = await getStorage().readText(fileOf(kind, slug));
  return raw === null ? null : parse(kind === 'about' ? ABOUT_SLUG : slug, raw);
}

export interface SaveInput {
  slug: string;
  /** 改名时原来的文件名；新建时为空 */
  originalSlug?: string;
  data: Record<string, unknown>;
  body: string;
  attachments?: Attachment[];
}

/** 空字符串、空数组不写进 frontmatter，文件更干净（标题除外） */
function cleanData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!/^[A-Za-z][\w-]*$/.test(key)) continue;
    if (key !== 'title' && (value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0))) continue;
    out[key] = value;
  }
  return out;
}

export function attachmentChanges(attachments: Attachment[] | undefined): Change[] {
  return (attachments ?? []).map((a) => {
    if (typeof a?.path !== 'string' || typeof a?.staged !== 'string' || !/^public\/(images\/uploads|music)\//.test(a.path)) {
      throw new AdminInputError('附件路径不合法');
    }
    return { path: a.path, staged: a.staged };
  });
}

export async function saveContent(kind: ContentKind, input: SaveInput): Promise<{ slug: string; sha: string | null }> {
  if (typeof input.body !== 'string' || typeof input.data !== 'object' || input.data === null) throw new AdminInputError('内容格式不对');
  const storage = getStorage();
  const slug = kind === 'about' ? ABOUT_SLUG : assertSlug(input.slug);
  const target = fileOf(kind, slug);
  const original = input.originalSlug ? assertSlug(input.originalSlug) : null;
  const renamed = kind !== 'about' && original !== null && original !== slug;

  if (kind !== 'about' && (!original || renamed) && (await storage.readText(target)) !== null) {
    throw new AdminInputError(`已经有一篇叫「${slug}」的了，换个文件名吧`);
  }
  // 保留原文件里后台没管到的字段
  const previous = original ? await getContent(kind, original) : kind === 'about' ? await getContent(kind, ABOUT_SLUG) : null;
  const data = cleanData({ ...(previous?.data ?? {}), ...input.data });
  const text = matter.stringify(`\n${input.body.trim()}\n`, data);

  const changes: Change[] = [...attachmentChanges(input.attachments), { path: target, content: text }];
  if (renamed) changes.push({ path: fileOf(kind, original!), delete: true });
  const title = str(data.title) || slug;
  const verb = original ? (renamed ? '改名并更新' : '更新') : '新建';
  const { sha } = await storage.commit(changes, `后台：${verb}${CONTENT_LABEL[kind]}「${title}」`);
  return { slug, sha };
}

export async function deleteContent(kind: ContentKind, slug: string): Promise<{ sha: string | null }> {
  if (kind === 'about') throw new AdminInputError('「关于我」不能删除');
  const storage = getStorage();
  const doc = await getContent(kind, slug);
  if (!doc) throw new AdminInputError('文件已经不存在了');
  return storage.commit([{ path: fileOf(kind, slug), delete: true }], `后台：删除${CONTENT_LABEL[kind]}「${str(doc.data.title) || slug}」`);
}
