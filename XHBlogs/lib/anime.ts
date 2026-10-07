// lib/anime.ts —— 追番：类型、文案与纯函数（客户端 / 服务端通用，不依赖 fs）
//
// 数据存放在 data/anime.json（一个数组），读写见 lib/server/animeStore.ts。
//
// 分季的电视剧、分部的系列电影（如指环王三部曲）都是一条记录：parts 是季 / 部的列表，
// progress 是从第一季第一集算起的累计集数（系列电影每部算 1 集），据此换算出「第几季第几集」。

export type AnimeStatus = 'watching' | 'planned' | 'completed' | 'paused';
export type AnimeKind = 'anime' | 'movie' | 'drama';
export type TmdbType = 'movie' | 'tv' | 'collection';

/** 电视剧的一季，或系列电影里的一部 */
export interface AnimePart {
  title: string;
  /** 本季集数；系列电影每部为 1 */
  episodes: number;
  airDate: string;
}

export interface AnimeEntry {
  /** bgm-<Bangumi 条目 id>，手动添加的为 m-xxxx */
  id: string;
  /** 展示标题（一般是中文名） */
  title: string;
  /** 原名，与 title 相同时可留空 */
  originalTitle: string;
  kind: AnimeKind;
  status: AnimeStatus;
  /** 站内路径（/anime/covers/...）或图片外链；留空显示占位 */
  cover: string;
  /** 已看集数（分季时为累计集数，系列电影为已看部数） */
  progress: number;
  /** 总集数，0 表示未知 / 未完结；有 parts 时等于各季集数之和 */
  totalEpisodes: number;
  /** 季 / 部列表；单季番剧、单部电影为空 */
  parts: AnimePart[];
  /** 我的评分 1–10，0 表示未评分 */
  rating: number;
  comment: string;
  tags: string[];
  /** 首播 / 上映日期 YYYY-MM-DD */
  airDate: string;
  /** 开始看 / 看完的日期 YYYY-MM-DD */
  startedAt: string;
  finishedAt: string;
  bangumiId: number | null;
  /** Bangumi 站内评分，仅作参考 */
  bangumiScore: number;
  tmdbId: number | null;
  tmdbType: TmdbType | null;
  /** TMDB 评分，仅作参考 */
  tmdbScore: number;
  createdAt: string;
  updatedAt: string;
}

/** 新建 / 编辑时客户端提交的字段（id 与时间戳由服务端生成） */
export type AnimeInput = Omit<AnimeEntry, 'id' | 'createdAt' | 'updatedAt'>;

export type SearchSource = 'bangumi' | 'tmdb';

/** Bangumi / TMDB 搜索结果（服务端已整理成统一格式） */
export interface SearchResult {
  source: SearchSource;
  id: number;
  /** TMDB 结果是电影还是电视剧；Bangumi 结果为 null */
  mediaType: 'movie' | 'tv' | null;
  title: string;
  originalTitle: string;
  kind: AnimeKind;
  cover: string;
  totalEpisodes: number;
  airDate: string;
  score: number;
  summary: string;
  tags: string[];
  platform: string;
}

/** TMDB 详情：已整理好的表单草稿；电影属于某个系列时附带系列信息，让用户选择加单部还是整个系列 */
export interface TmdbDetail {
  draft: AnimeInput;
  collection: { id: number; name: string } | null;
}

export const STATUS_ORDER: readonly AnimeStatus[] = ['watching', 'planned', 'completed', 'paused'];

export const STATUS_LABEL: Record<AnimeStatus, string> = {
  watching: '在看',
  planned: '想看',
  completed: '看过',
  paused: '搁置',
};

export const STATUS_STYLE: Record<AnimeStatus, string> = {
  watching: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
  planned: 'bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300',
  completed: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300',
  paused: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300',
};

export const KIND_ORDER: readonly AnimeKind[] = ['anime', 'movie', 'drama'];

export const KIND_LABEL: Record<AnimeKind, string> = {
  anime: '番剧',
  movie: '电影',
  drama: '电视剧',
};

export const isAnimeStatus = (v: unknown): v is AnimeStatus =>
  typeof v === 'string' && (STATUS_ORDER as readonly string[]).includes(v);

export const isAnimeKind = (v: unknown): v is AnimeKind =>
  typeof v === 'string' && (KIND_ORDER as readonly string[]).includes(v);

const pad = (n: number): string => String(n).padStart(2, '0');

/** 本地时区的今天，YYYY-MM-DD */
export function todayString(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function emptyInput(): AnimeInput {
  return {
    title: '',
    originalTitle: '',
    kind: 'anime',
    status: 'planned',
    cover: '',
    progress: 0,
    totalEpisodes: 0,
    parts: [],
    rating: 0,
    comment: '',
    tags: [],
    airDate: '',
    startedAt: '',
    finishedAt: '',
    bangumiId: null,
    bangumiScore: 0,
    tmdbId: null,
    tmdbType: null,
    tmdbScore: 0,
  };
}

/** Bangumi 搜索结果直接转成表单；TMDB 结果需要再取详情（季 / 系列），见 /api/anime/tmdb */
export function inputFromBangumi(subject: SearchResult): AnimeInput {
  return {
    ...emptyInput(),
    title: subject.title,
    originalTitle: subject.originalTitle === subject.title ? '' : subject.originalTitle,
    kind: subject.kind,
    cover: subject.cover,
    totalEpisodes: subject.totalEpisodes,
    airDate: subject.airDate,
    tags: subject.tags,
    bangumiId: subject.id,
    bangumiScore: subject.score,
  };
}

export function toInput({ id: _id, createdAt: _c, updatedAt: _u, ...input }: AnimeEntry): AnimeInput {
  return input;
}

/**
 * 切换状态时顺手补上日期：开始看记下开始日期，看完记下看完日期并把进度拉满。
 * 已经填过的日期不覆盖。
 */
export function withStatus(input: AnimeInput, status: AnimeStatus, today = todayString()): AnimeInput {
  const next = { ...input, status };
  if ((status === 'watching' || status === 'completed') && !next.startedAt) next.startedAt = today;
  if (status === 'completed') {
    if (!next.finishedAt) next.finishedAt = today;
    if (next.totalEpisodes > 0) next.progress = next.totalEpisodes;
  }
  return next;
}

/**
 * 改进度时同步状态：想看 / 搁置开始看了就转为在看，看到最后一集转为看过，
 * 从「看过」往回调则回到在看。
 */
export function withProgress(input: AnimeInput, progress: number, today = todayString()): AnimeInput {
  const total = input.totalEpisodes;
  let next: AnimeInput = { ...input, progress: total > 0 ? Math.min(Math.max(0, progress), total) : Math.max(0, progress) };
  if (next.progress > 0 && (next.status === 'planned' || next.status === 'paused')) next = withStatus(next, 'watching', today);
  if (total > 0 && next.progress >= total && next.status !== 'completed') next = withStatus(next, 'completed', today);
  else if (total > 0 && next.progress < total && next.status === 'completed') next = { ...next, status: 'watching', finishedAt: '' };
  return next;
}

/** 「+1 集 / +1 部」 */
export const bumpProgress = (input: AnimeInput, today = todayString()): AnimeInput => withProgress(input, input.progress + 1, today);

type ProgressFields = Pick<AnimeEntry, 'progress' | 'totalEpisodes' | 'kind' | 'status' | 'parts'>;

/** 分季 / 分部：多于一季（部）才按季显示 */
export const hasParts = (entry: Pick<AnimeEntry, 'parts'>): boolean => entry.parts.length > 1;

/** 单部电影只有「看没看」，没有进度 */
export const isSingleMovie = (entry: Pick<AnimeEntry, 'kind' | 'parts'>): boolean => entry.kind === 'movie' && !hasParts(entry);

/**
 * 累计集数 → 最后看到的是第几季（下标）的第几集。
 * 看完第 1 季（10 集）时返回 { index: 0, episode: 10 }，再 +1 才进入第 2 季。
 */
export function locateProgress(parts: readonly AnimePart[], progress: number): { index: number; episode: number } {
  let before = 0;
  for (let i = 0; i < parts.length; i++) {
    if (progress <= before + parts[i].episodes) return { index: i, episode: Math.max(0, progress - before) };
    before += parts[i].episodes;
  }
  const last = Math.max(0, parts.length - 1);
  return { index: last, episode: parts[last]?.episodes ?? 0 };
}

/** 第 index 季（下标）第 episode 集 → 累计集数 */
export function cumulativeProgress(parts: readonly AnimePart[], index: number, episode: number): number {
  let before = 0;
  for (let i = 0; i < index && i < parts.length; i++) before += parts[i].episodes;
  const eps = parts[index]?.episodes ?? 0;
  return before + Math.min(Math.max(0, episode), eps);
}

/** 第 index 季（下标）看完时的累计集数 */
export const progressThroughPart = (parts: readonly AnimePart[], index: number): number =>
  cumulativeProgress(parts, index, parts[index]?.episodes ?? 0);

/** 进度文案：12 / 24 集、第 2 季 · 3 / 10 集、已看 1 / 3 部、电影看过显示「已看完」 */
export function progressText(entry: ProgressFields): string {
  const n = entry.parts.length;
  if (entry.kind === 'movie') {
    if (n > 1) return entry.progress >= n ? `全 ${n} 部看完` : `已看 ${entry.progress} / ${n} 部`;
    return entry.status === 'completed' ? '已看完' : '未看';
  }
  if (n > 1) {
    if (entry.progress <= 0) return `共 ${n} 季 · ${entry.totalEpisodes} 集`;
    if (entry.totalEpisodes > 0 && entry.progress >= entry.totalEpisodes) return `全 ${n} 季看完`;
    const { index, episode } = locateProgress(entry.parts, entry.progress);
    return `第 ${index + 1} 季 · ${episode} / ${entry.parts[index].episodes} 集`;
  }
  if (entry.totalEpisodes > 0) return `${entry.progress} / ${entry.totalEpisodes} 集`;
  return entry.progress > 0 ? `已看 ${entry.progress} 集` : '未开始';
}

export function progressRatio(entry: ProgressFields): number {
  if (entry.status === 'completed') return 1;
  if (isSingleMovie(entry) || entry.totalEpisodes <= 0) return 0;
  return Math.min(1, entry.progress / entry.totalEpisodes);
}

/** 从输入框里解析 Bangumi 条目 id：纯数字，或 bgm.tv / bangumi.tv 的条目链接 */
export function parseBangumiId(text: string): number | null {
  const trimmed = text.trim();
  const m = /^(\d{1,9})$/.exec(trimmed) ?? /(?:bgm\.tv|bangumi\.tv|chii\.in)\/subject\/(\d{1,9})/i.exec(trimmed);
  return m ? Number(m[1]) : null;
}

export const bangumiUrl = (id: number): string => `https://bgm.tv/subject/${id}`;

/** 从输入框里解析 TMDB 链接：themoviedb.org/tv/1399-xxx、/movie/120、/collection/119 */
export function parseTmdbLink(text: string): { type: TmdbType; id: number } | null {
  const m = /themoviedb\.org\/(movie|tv|collection)\/(\d{1,9})/i.exec(text.trim());
  return m ? { type: m[1].toLowerCase() as TmdbType, id: Number(m[2]) } : null;
}

export const tmdbUrl = (type: TmdbType, id: number): string => `https://www.themoviedb.org/${type}/${id}`;

/** 列表里是否已有同一部（按 Bangumi / TMDB 编号判断） */
export function isSameWork(
  a: Pick<AnimeInput, 'bangumiId' | 'tmdbId' | 'tmdbType'>,
  b: Pick<AnimeInput, 'bangumiId' | 'tmdbId' | 'tmdbType'>,
): boolean {
  if (a.bangumiId && a.bangumiId === b.bangumiId) return true;
  return !!a.tmdbId && a.tmdbId === b.tmdbId && a.tmdbType === b.tmdbType;
}
