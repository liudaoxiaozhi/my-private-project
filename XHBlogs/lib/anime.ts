// lib/anime.ts —— 追番：类型、文案与纯函数（客户端 / 服务端通用，不依赖 fs）
//
// 数据存放在 data/anime.json（一个数组），读写见 lib/server/animeStore.ts。

export type AnimeStatus = 'watching' | 'planned' | 'completed' | 'paused';
export type AnimeKind = 'anime' | 'movie' | 'drama';

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
  /** 已看集数 */
  progress: number;
  /** 总集数，0 表示未知 / 未完结 */
  totalEpisodes: number;
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
  createdAt: string;
  updatedAt: string;
}

/** 新建 / 编辑时客户端提交的字段（id 与时间戳由服务端生成） */
export type AnimeInput = Omit<AnimeEntry, 'id' | 'createdAt' | 'updatedAt'>;

/** Bangumi 搜索结果（服务端已整理成统一格式） */
export interface BangumiSubject {
  id: number;
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
  drama: '剧集',
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
    rating: 0,
    comment: '',
    tags: [],
    airDate: '',
    startedAt: '',
    finishedAt: '',
    bangumiId: null,
    bangumiScore: 0,
  };
}

export function inputFromSubject(subject: BangumiSubject): AnimeInput {
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

/** 「+1 集」：想看 / 搁置会自动转为在看，看到最后一集自动转为看过 */
export function bumpProgress(input: AnimeInput, today = todayString()): AnimeInput {
  const progress = input.totalEpisodes > 0 ? Math.min(input.progress + 1, input.totalEpisodes) : input.progress + 1;
  let next: AnimeInput = { ...input, progress };
  if (next.status !== 'watching' && next.status !== 'completed') next = withStatus(next, 'watching', today);
  if (next.totalEpisodes > 0 && progress >= next.totalEpisodes) next = withStatus(next, 'completed', today);
  return next;
}

/** 进度文案：12 / 24 集、已看 3 集、电影看过显示「已看完」 */
export function progressText(entry: Pick<AnimeEntry, 'progress' | 'totalEpisodes' | 'kind' | 'status'>): string {
  if (entry.kind === 'movie') return entry.status === 'completed' ? '已看完' : '未看';
  if (entry.totalEpisodes > 0) return `${entry.progress} / ${entry.totalEpisodes} 集`;
  return entry.progress > 0 ? `已看 ${entry.progress} 集` : '未开始';
}

export function progressRatio(entry: Pick<AnimeEntry, 'progress' | 'totalEpisodes' | 'kind' | 'status'>): number {
  if (entry.status === 'completed') return 1;
  if (entry.kind === 'movie' || entry.totalEpisodes <= 0) return 0;
  return Math.min(1, entry.progress / entry.totalEpisodes);
}

/** 从输入框里解析 Bangumi 条目 id：纯数字，或 bgm.tv / bangumi.tv 的条目链接 */
export function parseBangumiId(text: string): number | null {
  const trimmed = text.trim();
  const m = /^(\d{1,9})$/.exec(trimmed) ?? /(?:bgm\.tv|bangumi\.tv|chii\.in)\/subject\/(\d{1,9})/i.exec(trimmed);
  return m ? Number(m[1]) : null;
}

export const bangumiUrl = (id: number): string => `https://bgm.tv/subject/${id}`;
