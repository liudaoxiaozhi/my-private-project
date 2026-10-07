// lib/server/animeStore.ts —— 追番数据的读写（仅服务端）
//
// 数据就是 data/anime.json 里的一个数组，可以直接手改；读的时候会补齐缺省字段。
// 写入只在本地开发模式（npm run dev / 本地预览.bat）开放：线上与 next start 下页面只读。
// Bangumi / TMDB 封面会下载到 public/anime/covers/，这样不依赖外链，部署后也能显示。
// TMDB 的搜索与详情见 lib/server/tmdb.ts。
import fs from 'fs';
import path from 'path';
import {
  isAnimeKind,
  isAnimeStatus,
  isSameWork,
  type AnimeEntry,
  type AnimeInput,
  type AnimeKind,
  type AnimePart,
  type SearchResult,
  type TmdbType,
} from '../anime';
import { AnimeError, cover, date, int, str } from './animeClean';
import { TMDB_IMAGE_HOST } from './tmdb';

export { AnimeError };

const DATA_FILE = path.join(process.cwd(), 'data', 'anime.json');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const COVER_DIR = path.join(PUBLIC_DIR, 'anime', 'covers');
const COVER_URL_PREFIX = '/anime/covers/';

/** 只有本地开发服务器允许修改；生产构建出来的页面是静态的，改了也不会刷新 */
export const ANIME_EDITABLE = process.env.NODE_ENV === 'development';

// ============================== 清洗 ==============================

const score10 = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(10, Math.max(0, Math.round(value * 10) / 10)) : 0;

const positiveId = (value: unknown): number | null => {
  const n = int(value, 0, 999_999_999);
  return n > 0 ? n : null;
};

const TMDB_TYPES: readonly TmdbType[] = ['movie', 'tv', 'collection'];

function sanitizeParts(value: unknown): AnimePart[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .map((raw) => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return { title: str(p.title, 200), episodes: int(p.episodes, 0, 9999), airDate: date(p.airDate) };
    })
    .filter((p) => p.title || p.episodes > 0);
}

export function sanitizeInput(raw: unknown): AnimeInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const parts = sanitizeParts(o.parts);
  // 分季时总集数以各季之和为准
  const partsTotal = parts.reduce((sum, p) => sum + p.episodes, 0);
  const totalEpisodes = parts.length > 0 && partsTotal > 0 ? Math.min(partsTotal, 99_999) : int(o.totalEpisodes, 0, 9999);
  const tmdbId = positiveId(o.tmdbId);
  const tmdbType = TMDB_TYPES.find((t) => t === o.tmdbType) ?? null;
  const tags = Array.isArray(o.tags)
    ? [...new Set(o.tags.map((t) => str(t, 20)).filter(Boolean))].slice(0, 12)
    : [];
  return {
    title: str(o.title, 200),
    originalTitle: str(o.originalTitle, 200),
    kind: isAnimeKind(o.kind) ? o.kind : 'anime',
    status: isAnimeStatus(o.status) ? o.status : 'planned',
    cover: cover(o.cover),
    progress: int(o.progress, 0, totalEpisodes > 0 ? totalEpisodes : 9999),
    totalEpisodes,
    parts,
    rating: int(o.rating, 0, 10),
    comment: str(o.comment, 2000),
    tags,
    airDate: date(o.airDate),
    startedAt: date(o.startedAt),
    finishedAt: date(o.finishedAt),
    bangumiId: positiveId(o.bangumiId),
    bangumiScore: score10(o.bangumiScore),
    tmdbId: tmdbId && tmdbType ? tmdbId : null,
    tmdbType: tmdbId && tmdbType ? tmdbType : null,
    tmdbScore: score10(o.tmdbScore),
  };
}

/** 手写条目没有 id 时，按标题生成一个稳定的 id，保证文件不变时每次读到的一致 */
function fallbackId(title: string, index: number): string {
  let h = 0;
  for (const ch of `${title}#${index}`) h = (Math.imul(h, 31) + ch.codePointAt(0)!) | 0;
  return `m-${(h >>> 0).toString(36)}`;
}

function sanitizeEntry(raw: unknown, index: number): AnimeEntry | null {
  const input = sanitizeInput(raw);
  if (!input.title) return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id, 64);
  const createdAt = str(o.createdAt, 40);
  return {
    id: /^[\w-]+$/.test(id) ? id : fallbackId(input.title, index),
    ...input,
    createdAt,
    updatedAt: str(o.updatedAt, 40) || createdAt,
  };
}

// ============================== 读写 ==============================

export function readAnimeList(): AnimeEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('读取 data/anime.json 失败:', error);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const list: AnimeEntry[] = [];
  parsed.forEach((raw, i) => {
    const entry = sanitizeEntry(raw, i);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      list.push(entry);
    }
  });
  return list;
}

function writeAnimeList(list: AnimeEntry[]): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  // 先写临时文件再替换，写到一半中断也不会把原文件弄坏
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// 同一进程内的写操作排队执行，避免连点「+1」时互相覆盖
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}


export function createAnime(raw: unknown): Promise<AnimeEntry> {
  return serialized(async () => {
    const input = sanitizeInput(raw);
    if (!input.title) throw new AnimeError('标题不能为空', 400);
    const list = readAnimeList();
    if (list.some((e) => isSameWork(e, input))) throw new AnimeError('这部已经在列表里了', 409);
    const id = input.bangumiId
      ? `bgm-${input.bangumiId}`
      : input.tmdbId
        ? `tmdb-${input.tmdbType}-${input.tmdbId}`
        : `m-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const entry: AnimeEntry = { id, ...input, cover: await localizeCover(input.cover, id), createdAt: now, updatedAt: now };
    writeAnimeList([entry, ...list]);
    return entry;
  });
}

export function updateAnime(id: string, raw: unknown): Promise<AnimeEntry> {
  return serialized(async () => {
    const input = sanitizeInput(raw);
    if (!input.title) throw new AnimeError('标题不能为空', 400);
    const list = readAnimeList();
    const index = list.findIndex((e) => e.id === id);
    if (index < 0) throw new AnimeError('条目不存在，可能已被删除', 404);
    const prev = list[index];
    const coverPath = input.cover === prev.cover ? prev.cover : await localizeCover(input.cover, id);
    const entry: AnimeEntry = { ...prev, ...input, cover: coverPath, id, updatedAt: new Date().toISOString() };
    list[index] = entry;
    writeAnimeList(list);
    if (prev.cover !== entry.cover) removeOwnCover(prev.cover, id);
    return entry;
  });
}

export function deleteAnime(id: string): Promise<void> {
  return serialized(async () => {
    const list = readAnimeList();
    const target = list.find((e) => e.id === id);
    if (!target) throw new AnimeError('条目不存在，可能已被删除', 404);
    writeAnimeList(list.filter((e) => e.id !== id));
    removeOwnCover(target.cover, id);
  });
}

// ============================== 封面 ==============================

/** 只下载 Bangumi / TMDB 图床的图片，其他外链原样保存 */
const BANGUMI_IMAGE_HOST = /(^|\.)(bgm\.tv|bangumi\.tv|chii\.in)$/i;
const canDownloadCover = (host: string): boolean => BANGUMI_IMAGE_HOST.test(host) || host === TMDB_IMAGE_HOST;
const COVER_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_COVER_BYTES = 5 * 1024 * 1024;

async function localizeCover(src: string, id: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  if (!canDownloadCover(url.hostname)) return src;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    const ext = COVER_EXT[(res.headers.get('content-type') ?? '').split(';')[0].trim()];
    if (!res.ok || !ext) throw new Error(`HTTP ${res.status} ${res.headers.get('content-type')}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_COVER_BYTES) throw new Error(`大小异常：${buf.length} 字节`);
    fs.mkdirSync(COVER_DIR, { recursive: true });
    // 文件名带上时间，换封面后浏览器 / 图片优化缓存不会拿到旧图
    const name = `${id}-${Date.now().toString(36)}.${ext}`;
    fs.writeFileSync(path.join(COVER_DIR, name), buf);
    return COVER_URL_PREFIX + name;
  } catch (error) {
    console.warn(`下载封面失败，先使用外链 ${src}:`, error);
    return src;
  }
}

/** 删掉本条目自己下载的旧封面（文件名以 id 开头），不碰手动放进去的图片 */
function removeOwnCover(coverPath: string, id: string): void {
  if (!coverPath.startsWith(COVER_URL_PREFIX)) return;
  const name = coverPath.slice(COVER_URL_PREFIX.length);
  if (!name.startsWith(`${id}-`) || name.includes('/') || name.includes('\\')) return;
  try {
    fs.rmSync(path.join(COVER_DIR, name), { force: true });
  } catch (error) {
    console.warn(`删除旧封面 ${name} 失败:`, error);
  }
}

// ============================== Bangumi 搜索 ==============================

// Bangumi 要求带上能识别来源的 User-Agent
const USER_AGENT = 'xhblogs-anime-tracker/1.0 (local)';
const BANGUMI_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const BANGUMI_API = 'https://api.bgm.tv';

interface RawSubject {
  id?: number;
  type?: number;
  name?: string;
  name_cn?: string;
  date?: string;
  air_date?: string;
  platform?: string;
  summary?: string;
  images?: { large?: string; common?: string; medium?: string } | null;
  image?: string;
  eps?: number;
  eps_count?: number;
  total_episodes?: number;
  rating?: { score?: number } | null;
  score?: number;
  tags?: Array<{ name?: string }>;
}

function kindOf(type: number | undefined, platform: string): AnimeKind {
  if (/剧场版|电影|movie/i.test(platform)) return 'movie';
  return type === 6 ? 'drama' : 'anime';
}

function toSubject(raw: RawSubject): SearchResult | null {
  if (!raw || typeof raw.id !== 'number') return null;
  const name = str(raw.name, 200);
  const nameCn = str(raw.name_cn, 200);
  const platform = str(raw.platform, 20);
  const airDate = date(raw.date) || date(raw.air_date);
  const score = raw.rating?.score ?? raw.score ?? 0;
  return {
    source: 'bangumi',
    id: raw.id,
    mediaType: null,
    title: nameCn || name,
    originalTitle: name,
    kind: kindOf(raw.type, platform),
    cover: cover(raw.images?.large || raw.images?.common || raw.image || '').replace(/^http:/, 'https:'),
    totalEpisodes: int(raw.total_episodes || raw.eps || raw.eps_count, 0, 9999),
    airDate,
    score: typeof score === 'number' ? score : 0,
    summary: str(raw.summary, 160),
    tags: (raw.tags ?? [])
      .map((t) => str(t?.name, 20))
      .filter(Boolean)
      .slice(0, 5),
    platform,
  };
}

async function bangumiFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { ...BANGUMI_HEADERS, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Bangumi 返回 HTTP ${res.status}`);
  return res.json();
}

/** 关键词搜索（动画 + 三次元），或直接按条目 id 取详情 */
export async function searchBangumi(keyword: string, subjectId: number | null): Promise<SearchResult[]> {
  if (subjectId) {
    const raw = (await bangumiFetch(`${BANGUMI_API}/v0/subjects/${subjectId}`)) as RawSubject | null;
    const subject = raw ? toSubject(raw) : null;
    return subject ? [subject] : [];
  }

  let list: RawSubject[] = [];
  try {
    const data = (await bangumiFetch(`${BANGUMI_API}/v0/search/subjects?limit=12`, {
      method: 'POST',
      body: JSON.stringify({ keyword, sort: 'match', filter: { type: [2, 6] } }),
    })) as { data?: RawSubject[] } | null;
    list = data?.data ?? [];
  } catch (error) {
    // 新版搜索接口偶尔不稳定，退回旧版接口（只搜动画）
    console.warn('Bangumi v0 搜索失败，改用旧接口:', error);
    const data = (await bangumiFetch(
      `${BANGUMI_API}/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=medium&max_results=12`,
    )) as { list?: RawSubject[] } | null;
    list = (data?.list ?? []).map((s) => ({ ...s, type: 2 }));
  }
  return list.map(toSubject).filter((s): s is SearchResult => s !== null);
}
