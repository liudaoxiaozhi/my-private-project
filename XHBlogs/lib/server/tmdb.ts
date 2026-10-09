// lib/server/tmdb.ts —— TMDB（电影 / 电视剧）搜索与详情（仅服务端）
//
// Key：环境变量 TMDB_API_KEY，或在追番页「电影 / 电视剧」搜索里 / 网页后台「追番与密钥」里填（本地写进 .env.local，
// 线上加密存进仓库，见 lib/server/admin/secrets.ts）：
// v3 的 API Key 或 v4 的 Read Access Token（eyJ 开头）都可以。
// 访问不了 api.themoviedb.org 时：在 .env.local 里配 HTTPS_PROXY 走本机代理（见 outboundFetch），
// 或用 TMDB_API_BASE / TMDB_IMAGE_BASE 换成自己的反代地址。
import { emptyInput, type AnimeKind, type AnimePart, type SearchResult, type TmdbDetail, type TmdbType } from '../anime';
import { AnimeError, date, int, str } from './animeClean';
import { isProxyConfigured, outboundFetch } from './outboundFetch';
import { getSecret } from './admin/secrets';

const trimSlash = (s: string) => s.replace(/\/+$/, '');
const API_BASE = trimSlash(process.env.TMDB_API_BASE?.trim() || 'https://api.themoviedb.org');
const IMAGE_BASE = trimSlash(process.env.TMDB_IMAGE_BASE?.trim() || 'https://image.tmdb.org');

/** 允许下载封面的图片域名（animeStore 用） */
export const TMDB_IMAGE_HOST = (() => {
  try {
    return new URL(IMAGE_BASE).hostname;
  } catch {
    return 'image.tmdb.org';
  }
})();

const apiKey = (): Promise<string> => getSecret('TMDB_API_KEY');
/** 构建时用（只看环境变量）：本地开发模式的页面初始状态 */
export const isTmdbConfigured = (): boolean => (process.env.TMDB_API_KEY ?? '').trim() !== '';
/** 运行时用：环境变量或后台保存的都算 */
export const tmdbConfigured = async (): Promise<boolean> => (await apiKey()) !== '';

const LANGUAGE = 'zh-CN';
/** TMDB 的「动画」类型 */
const GENRE_ANIMATION = 16;

const TMDB_TIMEOUT_MS = 10_000;

/** 连不上时告诉用户该怎么办：国内网络下 Node 不走系统代理，最常见的原因就是这个 */
function unreachableMessage(error: unknown): string {
  const timedOut = error instanceof Error && error.name === 'TimeoutError';
  const host = new URL(API_BASE).host;
  const what = timedOut ? `连接 ${host} 超时` : `连不上 ${host}`;
  if (isProxyConfigured()) return `${what}：已配置 HTTPS_PROXY，请确认代理软件开着、端口没填错`;
  return `${what}。本地服务器不会走系统代理：在 XHBlogs/.env.local 里加一行 HTTPS_PROXY=http://127.0.0.1:7890（端口换成你代理软件的 HTTP 端口），保存后再试`;
}

async function tmdbFetch<T>(pathname: string, params: Record<string, string> = {}, keyOverride?: string): Promise<T> {
  const key = keyOverride ?? (await apiKey());
  if (!key) throw new AnimeError('还没有配置 TMDB Key：在追番页「电影 / 电视剧」搜索里填一下', 400);

  const url = new URL(`${API_BASE}/3${pathname}`);
  url.searchParams.set('language', LANGUAGE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // v4 Read Access Token 走 Authorization 头，v3 API Key 走查询参数
  const isToken = key.startsWith('eyJ');
  if (!isToken) url.searchParams.set('api_key', key);

  let res: Response;
  try {
    res = await outboundFetch(url, {
      headers: { Accept: 'application/json', ...(isToken ? { Authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('请求 TMDB 失败:', error);
    throw new AnimeError(unreachableMessage(error), 502);
  }
  if (res.status === 401) throw new AnimeError('TMDB Key 无效，请重新填写', 401);
  if (res.status === 404) throw new AnimeError('TMDB 上找不到这个条目', 404);
  if (!res.ok) throw new AnimeError(`TMDB 返回 HTTP ${res.status}`, 502);
  return (await res.json()) as T;
}

const poster = (p: unknown, size = 'w500'): string => {
  const s = str(p, 200);
  return s.startsWith('/') ? `${IMAGE_BASE}/t/p/${size}${s}` : '';
};

const score = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);

/** 日漫 / 国漫动画剧集算「番剧」，其他剧集算「电视剧」 */
function tvKind(genreIds: number[], language: unknown): AnimeKind {
  return genreIds.includes(GENRE_ANIMATION) && (language === 'ja' || language === 'zh') ? 'anime' : 'drama';
}

/** 原名与译名相同时不重复显示 */
const originalOf = (title: string, original: string) => (original && original !== title ? original : '');

/** 用一个很轻的接口试一下 Key 是否可用 */
export async function verifyTmdbKey(key: string): Promise<void> {
  await tmdbFetch('/configuration', {}, key);
}

// ============================== 搜索 ==============================

interface RawResult {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  overview?: string;
  genre_ids?: number[];
}

export async function searchTmdb(keyword: string): Promise<SearchResult[]> {
  const data = await tmdbFetch<{ results?: RawResult[] }>('/search/multi', { query: keyword, include_adult: 'false', page: '1' });
  return (data.results ?? [])
    .filter((r): r is RawResult & { id: number; media_type: 'movie' | 'tv' } =>
      typeof r.id === 'number' && (r.media_type === 'movie' || r.media_type === 'tv'),
    )
    .slice(0, 12)
    .map((r) => {
      const isMovie = r.media_type === 'movie';
      const original = str(isMovie ? r.original_title : r.original_name, 200);
      return {
        source: 'tmdb' as const,
        id: r.id,
        mediaType: r.media_type,
        title: str(isMovie ? r.title : r.name, 200) || original,
        originalTitle: original,
        kind: isMovie ? 'movie' : tvKind(r.genre_ids ?? [], r.original_language),
        cover: poster(r.poster_path, 'w185'),
        totalEpisodes: 0,
        airDate: date(isMovie ? r.release_date : r.first_air_date),
        score: score(r.vote_average),
        summary: str(r.overview, 160),
        tags: [],
        platform: isMovie ? '电影' : '电视剧',
      };
    });
}

// ============================== 详情 ==============================

interface RawGenre {
  id?: number;
  name?: string;
}

interface RawTv {
  name?: string;
  original_name?: string;
  original_language?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  number_of_episodes?: number;
  genres?: RawGenre[];
  seasons?: Array<{ season_number?: number; name?: string; episode_count?: number; air_date?: string }>;
}

interface RawMovie {
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  genres?: RawGenre[];
  belongs_to_collection?: { id?: number; name?: string } | null;
}

interface RawCollection {
  name?: string;
  original_name?: string;
  poster_path?: string | null;
  parts?: Array<{ title?: string; original_title?: string; release_date?: string; poster_path?: string | null; vote_average?: number }>;
}

const genreNames = (genres: RawGenre[] | undefined): string[] =>
  (genres ?? [])
    .map((g) => str(g.name, 20))
    .filter(Boolean)
    .slice(0, 5);

async function tvDetail(id: number): Promise<TmdbDetail> {
  const tv = await tmdbFetch<RawTv>(`/tv/${id}`);
  // 第 0 季是特别篇，不计入进度；还没公布集数的新季也先不算
  const parts: AnimePart[] = (tv.seasons ?? [])
    .filter((s) => typeof s.season_number === 'number' && s.season_number > 0 && int(s.episode_count, 0, 9999) > 0)
    .sort((a, b) => a.season_number! - b.season_number!)
    .map((s) => ({
      title: str(s.name, 200) || `第 ${s.season_number} 季`,
      episodes: int(s.episode_count, 0, 9999),
      airDate: date(s.air_date),
    }));
  const title = str(tv.name, 200) || str(tv.original_name, 200);
  return {
    draft: {
      ...emptyInput(),
      title,
      originalTitle: originalOf(title, str(tv.original_name, 200)),
      kind: tvKind((tv.genres ?? []).map((g) => g.id ?? 0), tv.original_language),
      cover: poster(tv.poster_path),
      parts,
      totalEpisodes: parts.length > 0 ? parts.reduce((sum, p) => sum + p.episodes, 0) : int(tv.number_of_episodes, 0, 9999),
      airDate: date(tv.first_air_date),
      tags: genreNames(tv.genres),
      tmdbId: id,
      tmdbType: 'tv',
      tmdbScore: score(tv.vote_average),
    },
    collection: null,
  };
}

async function movieDetail(id: number): Promise<TmdbDetail> {
  const movie = await tmdbFetch<RawMovie>(`/movie/${id}`);
  const title = str(movie.title, 200) || str(movie.original_title, 200);
  const col = movie.belongs_to_collection;
  return {
    draft: {
      ...emptyInput(),
      title,
      originalTitle: originalOf(title, str(movie.original_title, 200)),
      kind: 'movie',
      cover: poster(movie.poster_path),
      airDate: date(movie.release_date),
      tags: genreNames(movie.genres),
      tmdbId: id,
      tmdbType: 'movie',
      tmdbScore: score(movie.vote_average),
    },
    collection: col && typeof col.id === 'number' ? { id: col.id, name: str(col.name, 200) || '系列电影' } : null,
  };
}

async function collectionDetail(id: number): Promise<TmdbDetail> {
  const col = await tmdbFetch<RawCollection>(`/collection/${id}`);
  // 按上映时间排；还没定档的放最后
  const movies = [...(col.parts ?? [])].sort((a, b) => (date(a.release_date) || '9999').localeCompare(date(b.release_date) || '9999'));
  const parts: AnimePart[] = movies.map((m) => ({
    title: str(m.title, 200) || str(m.original_title, 200) || '未命名',
    episodes: 1,
    airDate: date(m.release_date),
  }));
  const rated = movies.map((m) => score(m.vote_average)).filter((v) => v > 0);
  const title = str(col.name, 200) || str(col.original_name, 200);
  return {
    draft: {
      ...emptyInput(),
      title,
      originalTitle: originalOf(title, str(col.original_name, 200)),
      kind: 'movie',
      cover: poster(col.poster_path) || poster(movies[0]?.poster_path),
      parts,
      totalEpisodes: parts.length,
      airDate: parts[0]?.airDate ?? '',
      tmdbId: id,
      tmdbType: 'collection',
      tmdbScore: rated.length ? score(rated.reduce((s, v) => s + v, 0) / rated.length) : 0,
    },
    collection: null,
  };
}

export function getTmdbDetail(type: TmdbType, id: number): Promise<TmdbDetail> {
  if (type === 'tv') return tvDetail(id);
  if (type === 'collection') return collectionDetail(id);
  return movieDetail(id);
}
