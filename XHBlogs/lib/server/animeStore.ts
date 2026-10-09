// lib/server/animeStore.ts —— 追番数据的读写（仅服务端）
//
// 数据就是 data/anime.json 里的一个数组，可以直接手改；读的时候会补齐缺省字段。
// 写入：本地开发模式（npm run dev / 本地预览.bat），或者登录了网页后台（见 app/api/anime/guard.ts）。
// 写入都经过后台的存储层（lib/server/admin/storage.ts）：本地直接写磁盘，线上提交到 GitHub，一次修改一个提交。
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
import { outboundFetch } from './outboundFetch';
import { TMDB_IMAGE_HOST } from './tmdb';
import { getSecret } from './admin/secrets';
import { getStorage } from './admin/storage';
import type { Change } from './admin/storage';

export { AnimeError };

const DATA_FILE = path.join(process.cwd(), 'data', 'anime.json');
/** 存储层里的路径（相对博客根目录） */
const DATA_PATH = 'data/anime.json';
const COVER_PATH = 'public/anime/covers';
const COVER_URL_PREFIX = '/anime/covers/';

/** 本地开发服务器上谁都能改；线上要登录网页后台（见 app/api/anime/guard.ts） */
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

/** 页面构建时读（磁盘上的文件） */
export function readAnimeList(): AnimeEntry[] {
  let text: string;
  try {
    text = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('读取 data/anime.json 失败:', error);
    return [];
  }
  return parseAnimeList(text);
}

/** 修改前读最新的（线上从 GitHub 读，别人刚改过的也能读到） */
async function readLatest(): Promise<AnimeEntry[]> {
  return parseAnimeList((await getStorage().readText(DATA_PATH)) ?? '[]');
}

function parseAnimeList(text: string): AnimeEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    console.error('解析 data/anime.json 失败:', error);
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

/** 列表连同封面的增删一起保存（线上是一个提交） */
async function writeAnimeList(list: AnimeEntry[], extra: Change[], message: string): Promise<void> {
  await getStorage().commit([...extra, { path: DATA_PATH, content: `${JSON.stringify(list, null, 2)}\n` }], message);
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
    const list = await readLatest();
    if (list.some((e) => isSameWork(e, input))) throw new AnimeError('这部已经在列表里了', 409);
    const id = input.bangumiId
      ? `bgm-${input.bangumiId}`
      : input.tmdbId
        ? `tmdb-${input.tmdbType}-${input.tmdbId}`
        : `m-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const cover = await localizeCover(input.cover, id);
    const entry: AnimeEntry = { id, ...input, cover: cover.url, createdAt: now, updatedAt: now };
    await writeAnimeList([entry, ...list], cover.changes, `追番：添加「${entry.title}」`);
    return entry;
  });
}

export function updateAnime(id: string, raw: unknown): Promise<AnimeEntry> {
  return serialized(async () => {
    const input = sanitizeInput(raw);
    if (!input.title) throw new AnimeError('标题不能为空', 400);
    const list = await readLatest();
    const index = list.findIndex((e) => e.id === id);
    if (index < 0) throw new AnimeError('条目不存在，可能已被删除', 404);
    const prev = list[index];
    const cover = input.cover === prev.cover ? { url: prev.cover, changes: [] } : await localizeCover(input.cover, id);
    const entry: AnimeEntry = { ...prev, ...input, cover: cover.url, id, updatedAt: new Date().toISOString() };
    list[index] = entry;
    const removed = prev.cover !== entry.cover ? removeOwnCover(prev.cover, id) : [];
    await writeAnimeList(list, [...cover.changes, ...removed], `追番：更新「${entry.title}」`);
    return entry;
  });
}

export function deleteAnime(id: string): Promise<void> {
  return serialized(async () => {
    const list = await readLatest();
    const target = list.find((e) => e.id === id);
    if (!target) throw new AnimeError('条目不存在，可能已被删除', 404);
    await writeAnimeList(list.filter((e) => e.id !== id), removeOwnCover(target.cover, id), `追番：删除「${target.title}」`);
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

/** 下载封面并暂存，随这次保存一起提交；下载失败就先用外链 */
async function localizeCover(src: string, id: string): Promise<{ url: string; changes: Change[] }> {
  const external = { url: src, changes: [] };
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return external;
  }
  if (!canDownloadCover(url.hostname)) return external;
  try {
    const res = await outboundFetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    const ext = COVER_EXT[(res.headers.get('content-type') ?? '').split(';')[0].trim()];
    if (!res.ok || !ext) throw new Error(`HTTP ${res.status} ${res.headers.get('content-type')}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_COVER_BYTES) throw new Error(`大小异常：${buf.length} 字节`);
    // 文件名带上时间，换封面后浏览器 / 图片优化缓存不会拿到旧图
    const name = `${id}-${Date.now().toString(36)}.${ext}`;
    const staged = await getStorage().stage(buf);
    return { url: COVER_URL_PREFIX + name, changes: [{ path: `${COVER_PATH}/${name}`, staged }] };
  } catch (error) {
    console.warn(`下载封面失败，先使用外链 ${src}:`, error);
    return external;
  }
}

/** 删掉本条目自己下载的旧封面（文件名以 id 开头），不碰手动放进去的图片 */
function removeOwnCover(coverPath: string, id: string): Change[] {
  if (!coverPath.startsWith(COVER_URL_PREFIX)) return [];
  const name = coverPath.slice(COVER_URL_PREFIX.length);
  if (!name.startsWith(`${id}-`) || name.includes('/') || name.includes('\\')) return [];
  return [{ path: `${COVER_PATH}/${name}`, delete: true }];
}

// ============================== Bangumi 搜索 ==============================

// Bangumi 要求带上能识别来源的 User-Agent
const USER_AGENT = 'xhblogs-anime-tracker/1.0 (local)';
const BANGUMI_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const BANGUMI_API = 'https://api.bgm.tv';

// 可选的 Bangumi Access Token（next.bgm.tv/demo/access-token 生成，存在 .env.local 的 BANGUMI_ACCESS_TOKEN）。
// 不登录时 Bangumi 会隐藏部分条目，登录后搜索结果与网站上一致。
const bangumiToken = (): Promise<string> => getSecret('BANGUMI_ACCESS_TOKEN');
/** 构建时用（只看环境变量） */
export const isBangumiLoggedIn = (): boolean => (process.env.BANGUMI_ACCESS_TOKEN ?? '').trim() !== '';
/** 运行时用：环境变量或后台保存的都算 */
export const bangumiConfigured = async (): Promise<boolean> => (await bangumiToken()) !== '';

const BANGUMI_TOKEN_INVALID = 'Bangumi 令牌已失效或不正确，点搜索框下面的「更换」重新填一下';

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

async function bangumiFetch(url: string, init?: { method?: string; body?: string }, tokenOverride?: string): Promise<unknown> {
  const token = tokenOverride ?? (await bangumiToken());
  const res = await outboundFetch(url, {
    ...init,
    headers: {
      ...BANGUMI_HEADERS,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 401 && token) throw new AnimeError(BANGUMI_TOKEN_INVALID, 401);
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
    if (error instanceof AnimeError) throw error;
    // 新版搜索接口偶尔不稳定，退回旧版接口（只搜动画）
    console.warn('Bangumi v0 搜索失败，改用旧接口:', error);
    const data = (await bangumiFetch(
      `${BANGUMI_API}/search/subject/${encodeURIComponent(keyword)}?type=2&responseGroup=medium&max_results=12`,
    )) as { list?: RawSubject[] } | null;
    list = (data?.list ?? []).map((s) => ({ ...s, type: 2 }));
  }
  return list.map(toSubject).filter((s): s is SearchResult => s !== null);
}

/** 验证 Bangumi Access Token，返回账号昵称 */
export async function verifyBangumiToken(token: string): Promise<string> {
  let me: { nickname?: string; username?: string } | null;
  try {
    me = (await bangumiFetch(`${BANGUMI_API}/v0/me`, undefined, token)) as typeof me;
  } catch (error) {
    if (error instanceof AnimeError) throw new AnimeError('令牌不正确或已过期，重新生成一个试试', 401);
    console.error('验证 Bangumi 令牌失败:', error);
    throw new AnimeError('连不上 Bangumi，稍后再试', 502);
  }
  return str(me?.nickname, 50) || str(me?.username, 50) || 'Bangumi 用户';
}
