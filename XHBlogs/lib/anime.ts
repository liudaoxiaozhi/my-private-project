// lib/anime.ts —— 书影音（番剧 / 电影 / 电视剧 / 书 / 音乐）：类型、文案与纯函数（客户端 / 服务端通用，不依赖 fs）
//
// 整个书影音库都存放在 data/anime.json（一个数组；文件名和条目 id 沿用追番时期的，没有改），读写见 lib/server/animeStore.ts。
// 页面在 /media（书影音）和 /media/wishlist（想看清单），接口仍在 /api/anime/**。
//
// 三个大类：影视 = 番剧 | 电影 | 电视剧，书，音乐。状态文案随类型变：想看 / 想读 / 想听、在看 / 在读 / 在听……（见 statusLabel）。
//
// 分季的电视剧、分部的系列电影（如指环王三部曲）都是一条记录：parts 是季 / 部的列表，
// progress 是从第一季第一集算起的累计集数（系列电影每部算 1 集），据此换算出「第几季第几集」。

export type AnimeStatus = 'watching' | 'planned' | 'completed' | 'paused';
export type AnimeKind = 'anime' | 'movie' | 'drama' | 'book' | 'music';
/** 书影音的三个大类 */
export type MediaSection = 'video' | 'book' | 'music';
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
  /** 作者（书）/ 艺人（音乐），影视一般留空 */
  creator: string;
  /** 想看清单：优先级 1–3，0 表示没设 */
  priority: number;
  /** 想看清单：为什么想看 */
  wishReason: string;
  /** 在哪看 / 读 / 听：影院、B站、微信读书、网易云…… */
  platform: string;
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
  /** Open Library 作品编号，如 OL27448W */
  openLibraryKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 新建 / 编辑时客户端提交的字段（id 与时间戳由服务端生成） */
export type AnimeInput = Omit<AnimeEntry, 'id' | 'createdAt' | 'updatedAt'>;

export type SearchSource = 'bangumi' | 'tmdb' | 'openlibrary';

/** Bangumi / TMDB / Open Library 搜索结果（服务端已整理成统一格式） */
export interface SearchResult {
  source: SearchSource;
  id: number;
  /** Open Library 作品编号（OL…W）；其他来源为 null */
  key: string | null;
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
  /** 来源站点上的「平台」（TV / 剧场版 / 小说 / 专辑……），只用来显示和判断类型，不是条目的 platform */
  platform: string;
  /** 作者 / 艺人 */
  creator: string;
}

/** TMDB 详情：已整理好的表单草稿；电影属于某个系列时附带系列信息，让用户选择加单部还是整个系列 */
export interface TmdbDetail {
  draft: AnimeInput;
  collection: { id: number; name: string } | null;
}

export const STATUS_ORDER: readonly AnimeStatus[] = ['watching', 'planned', 'completed', 'paused'];

/** 不分类型时的中性文案（全部分栏、搜索索引）；具体条目用 statusLabel(status, kind) */
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

export const KIND_ORDER: readonly AnimeKind[] = ['anime', 'movie', 'drama', 'book', 'music'];

export const KIND_LABEL: Record<AnimeKind, string> = {
  anime: '番剧',
  movie: '电影',
  drama: '电视剧',
  book: '书',
  music: '音乐',
};

export const SECTION_ORDER: readonly MediaSection[] = ['video', 'book', 'music'];

export const SECTION_LABEL: Record<MediaSection, string> = {
  video: '影视',
  book: '书',
  music: '音乐',
};

/** 每个大类包含的类型 */
export const SECTION_KINDS: Record<MediaSection, readonly AnimeKind[]> = {
  video: ['anime', 'movie', 'drama'],
  book: ['book'],
  music: ['music'],
};

/** 在某个大类下新建条目时的默认类型 */
export const SECTION_DEFAULT_KIND: Record<MediaSection, AnimeKind> = { video: 'anime', book: 'book', music: 'music' };

export const sectionOf = (kind: AnimeKind): MediaSection => (kind === 'book' ? 'book' : kind === 'music' ? 'music' : 'video');

/** 看 / 读 / 听 */
export const verbOf = (kind: AnimeKind): string => (kind === 'book' ? '读' : kind === 'music' ? '听' : '看');

/** 按类型的状态文案：想看 / 想读 / 想听、在看 / 在读 / 在听、看过 / 读过 / 听过、搁置；不传类型时用中性的「看」 */
export function statusLabel(status: AnimeStatus, kind?: AnimeKind): string {
  const v = kind ? verbOf(kind) : '看';
  switch (status) {
    case 'watching':
      return `在${v}`;
    case 'planned':
      return `想${v}`;
    case 'completed':
      return `${v}过`;
    default:
      return '搁置';
  }
}

/** 进度单位：集（番剧 / 电视剧）、部（电影）、页（书）、首（音乐） */
export const PROGRESS_UNIT: Record<AnimeKind, string> = { anime: '集', drama: '集', movie: '部', book: '页', music: '首' };

/** 首播 / 上映 / 出版 / 发行，开始看 / 看完…… */
export function dateLabels(kind: AnimeKind): { air: string; start: string; finish: string } {
  const v = verbOf(kind);
  const air = kind === 'movie' ? '上映' : kind === 'book' ? '出版' : kind === 'music' ? '发行' : '首播';
  return { air, start: `开始${v}`, finish: `${v}完` };
}

/** 作者 / 艺人这一栏叫什么；影视不显示 */
export const creatorLabel = (kind: AnimeKind): string | null => (kind === 'book' ? '作者' : kind === 'music' ? '艺人' : null);

/** 「在哪看 / 读 / 听」的建议，编辑时点一下填入 */
export const PLATFORM_SUGGESTIONS: Record<MediaSection, readonly string[]> = {
  video: ['影院', 'B站', 'Netflix', '爱奇艺', '腾讯视频', '优酷'],
  book: ['微信读书', 'Kindle', '实体书', '图书馆'],
  music: ['网易云', 'Apple Music', 'Spotify', 'QQ音乐', '黑胶 / CD'],
};

export const PRIORITY_MAX = 3;

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
    creator: '',
    priority: 0,
    wishReason: '',
    platform: '',
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
    openLibraryKey: null,
  };
}

/**
 * Bangumi / Open Library 搜索结果直接转成表单；TMDB 结果需要再取详情（季 / 系列），见 /api/anime/tmdb。
 * 结果里的 platform 是来源站点的分类（TV / 小说……），不是「在哪看」，不带过来。
 */
export function inputFromSearch(subject: SearchResult): AnimeInput {
  const base: AnimeInput = {
    ...emptyInput(),
    title: subject.title,
    originalTitle: subject.originalTitle === subject.title ? '' : subject.originalTitle,
    kind: subject.kind,
    cover: subject.cover,
    totalEpisodes: subject.totalEpisodes,
    airDate: subject.airDate,
    tags: subject.tags,
    creator: subject.creator,
  };
  if (subject.source === 'openlibrary') return { ...base, openLibraryKey: subject.key };
  return { ...base, bangumiId: subject.id, bangumiScore: subject.score };
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

/** 「+1 集 / +1 部 / +1 首」 */
export const bumpProgress = (input: AnimeInput, today = todayString()): AnimeInput => withProgress(input, input.progress + 1, today);

type ProgressFields = Pick<AnimeEntry, 'progress' | 'totalEpisodes' | 'kind' | 'status' | 'parts'>;

/** 分季 / 分部：多于一季（部）才按季显示 */
export const hasParts = (entry: Pick<AnimeEntry, 'parts'>): boolean => entry.parts.length > 1;

/** 单部电影只有「看没看」，没有进度 */
export const isSingleMovie = (entry: Pick<AnimeEntry, 'kind' | 'parts'>): boolean => entry.kind === 'movie' && !hasParts(entry);

/**
 * 卡片上的快捷按钮：bump =「+1 集 / 部 / 首」；finish = 直接标记看过 / 读过 / 听过。
 * 单部电影、书（一页一页点没意义）、没填曲目数的专辑用 finish。
 */
export function quickAction(entry: Pick<AnimeEntry, 'kind' | 'parts' | 'totalEpisodes' | 'status'>): 'bump' | 'finish' | null {
  if (entry.status === 'completed') return null;
  if (isSingleMovie(entry) || entry.kind === 'book' || (entry.kind === 'music' && entry.totalEpisodes <= 0)) return 'finish';
  return 'bump';
}

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

/** 进度文案：12 / 24 集、第 2 季 · 3 / 10 集、已看 1 / 3 部、120 / 320 页、电影看过显示「已看完」 */
export function progressText(entry: ProgressFields): string {
  const n = entry.parts.length;
  const v = verbOf(entry.kind);
  const unit = PROGRESS_UNIT[entry.kind];
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
  if (entry.totalEpisodes > 0) return `${entry.progress} / ${entry.totalEpisodes} ${unit}`;
  if (entry.progress > 0) return `已${v} ${entry.progress} ${unit}`;
  return entry.status === 'completed' ? `已${v}完` : '未开始';
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

export const openLibraryUrl = (key: string): string => `https://openlibrary.org/works/${key}`;

/** 判断是不是同一部用到的外部编号 */
export type WorkIds = Pick<AnimeInput, 'bangumiId' | 'tmdbId' | 'tmdbType' | 'openLibraryKey'>;

/** 列表里是否已有同一部（按 Bangumi / TMDB / Open Library 编号判断） */
export function isSameWork(a: WorkIds, b: WorkIds): boolean {
  if (a.bangumiId && a.bangumiId === b.bangumiId) return true;
  if (a.openLibraryKey && a.openLibraryKey === b.openLibraryKey) return true;
  return !!a.tmdbId && a.tmdbId === b.tmdbId && a.tmdbType === b.tmdbType;
}

export const DAY_MS = 86_400_000;

/** 加入多少天：today 是「从 1970 年起的第几天」（Math.floor(Date.now() / DAY_MS)）；没有 createdAt 时返回 null */
export function daysSince(iso: string, today: number): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, today - Math.floor(t / DAY_MS));
}
