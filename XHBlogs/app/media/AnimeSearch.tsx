'use client';
// app/media/AnimeSearch.tsx —— 添加到书影音的第一步：先选大类，再从对应的来源搜索
//
// 影视：Bangumi（动画 + 三次元）/ TMDB（电影 / 电视剧）；书：Bangumi 书籍 / Open Library；音乐：Bangumi 音乐。
// 搜不到时随时可以手动填写，类型默认是当前大类的。
// TMDB 的结果要再取一次详情：电视剧拿到每季集数；电影如果属于某个系列（如指环王），让用户选加单部还是整个系列。
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ChevronLeft, ExternalLink, Film, KeyRound, Layers, Loader2, Search } from 'lucide-react';
import AppImage from '../../components/AppImage';
import {
  KIND_LABEL,
  PROGRESS_UNIT,
  SECTION_LABEL,
  SECTION_ORDER,
  inputFromSearch,
  parseTmdbLink,
  statusLabel,
  type AnimeEntry,
  type AnimeInput,
  type MediaSection,
  type SearchResult,
  type SearchSource,
  type TmdbDetail,
  type TmdbType,
  type WorkIds,
} from '../../lib/anime';

type ExistingFinder = (ids: WorkIds) => AnimeEntry | undefined;

export type CredentialService = 'tmdb' | 'bangumi';
/** 服务端是否已保存 TMDB Key / Bangumi 令牌 */
export type Credentials = Record<CredentialService, boolean>;

interface AnimeSearchProps {
  /** 一开始在哪个大类下搜（可以在弹窗里切换） */
  initialSection: MediaSection;
  credentials: Credentials;
  onCredentialSaved: (service: CredentialService, nickname?: string) => void;
  findExisting: ExistingFinder;
  onDraft: (draft: AnimeInput) => void;
  onOpenExisting: (entry: AnimeEntry) => void;
  /** 手动填写：带上搜索框里的文字和当前大类 */
  onManual: (title: string, section: MediaSection) => void;
  inputClassName: string;
}

interface SourceOption {
  id: SearchSource;
  label: string;
  hint: string;
  /** 搜索框下面的一句说明 */
  note: string;
}

const SOURCES: Record<MediaSection, SourceOption[]> = {
  video: [
    { id: 'bangumi', label: '动画 · Bangumi', hint: '番名，或 Bangumi 条目链接 / 编号', note: '自动填好封面、集数和首播日期。' },
    { id: 'tmdb', label: '电影 / 电视剧 · TMDB', hint: '片名 / 剧名，或 TMDB 链接', note: '自动填好海报、每季集数；系列电影可以整套一起记。' },
  ],
  book: [
    { id: 'bangumi', label: '书籍 · Bangumi', hint: '书名，或 Bangumi 条目链接 / 编号', note: '中文书、轻小说、漫画比较全；自动填好封面、作者和页数。' },
    { id: 'openlibrary', label: 'Open Library', hint: '书名或作者（外文书更全）', note: '外文书比较全，不用密钥；自动填好封面、作者和页数。' },
  ],
  music: [{ id: 'bangumi', label: '音乐 · Bangumi', hint: '专辑 / 单曲名，或 Bangumi 条目链接 / 编号', note: '自动填好封面、艺人和曲目数。' }],
};

/** 每个大类记住上次用的来源（影视沿用追番时期的键） */
const SOURCE_KEY: Record<MediaSection, string> = {
  video: 'anime-search-source',
  book: 'media-search-source-book',
  music: 'media-search-source-music',
};

const SOURCE_NAME: Record<SearchSource, string> = { bangumi: 'Bangumi', tmdb: 'TMDB', openlibrary: 'Open Library' };

function readSource(section: MediaSection): SearchSource {
  const options = SOURCES[section];
  try {
    const stored = localStorage.getItem(SOURCE_KEY[section]);
    return options.find((s) => s.id === stored)?.id ?? options[0].id;
  } catch {
    return options[0].id;
  }
}

const idsOf = (r: SearchResult): WorkIds =>
  r.source === 'tmdb'
    ? { bangumiId: null, tmdbId: r.id, tmdbType: r.mediaType, openLibraryKey: null }
    : r.source === 'openlibrary'
      ? { bangumiId: null, tmdbId: null, tmdbType: null, openLibraryKey: r.key }
      : { bangumiId: r.id, tmdbId: null, tmdbType: null, openLibraryKey: null };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  return data;
}

const codeClass = 'rounded bg-black/5 px-1 dark:bg-white/10';

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mx-1 inline-flex items-center gap-0.5 font-bold text-indigo-500 hover:underline">
      {children} <ExternalLink size={11} />
    </a>
  );
}

const CREDENTIAL_FORMS: Record<
  CredentialService,
  {
    title: string;
    description: ReactNode;
    placeholder: string;
    endpoint: string;
    waitingText: string;
    cancelText: (saved: boolean) => string;
  }
> = {
  tmdb: {
    title: '填写 TMDB Key',
    description: (
      <>
        搜电影和电视剧要用 TMDB。API Key（32 位）或 Read Access Token 都行，在
        <ExtLink href="https://www.themoviedb.org/settings/api">TMDB 设置页</ExtLink>
        能找到。
      </>
    ),
    placeholder: '粘贴你的 TMDB Key',
    endpoint: '/api/anime/tmdb-key',
    waitingText: '正在由本地服务器连接 TMDB 验证……国内网络下通常需要代理，连不上的话稍后会提示怎么设置。',
    cancelText: () => '取消，继续用现在的 Key',
  },
  bangumi: {
    title: '登录 Bangumi',
    description: (
      <>
        不登录也能搜，但 Bangumi 会对未登录的请求隐藏一部分条目。在
        <ExtLink href="https://next.bgm.tv/demo/access-token">Bangumi 令牌页</ExtLink>
        登录后「创建个人令牌」（有效期可以选长一点），把生成的 Access Token 粘贴到这里。
      </>
    ),
    placeholder: '粘贴 Bangumi Access Token',
    endpoint: '/api/anime/bangumi-token',
    waitingText: '正在连接 Bangumi 验证……',
    cancelText: (saved) => (saved ? '取消，继续用现在的令牌' : '先不登录'),
  },
};

/** 填写 TMDB Key / Bangumi 令牌：服务端先验证，通过后写进本机 .env.local */
function CredentialForm({
  service,
  saved,
  inputClassName,
  onSaved,
  onCancel,
}: {
  service: CredentialService;
  saved: boolean;
  inputClassName: string;
  onSaved: (nickname?: string) => void;
  onCancel?: () => void;
}) {
  const config = CREDENTIAL_FORMS[service];
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');

  // 服务端连外网最多等 10 秒左右，超过 3 秒就先告诉用户在等什么
  useEffect(() => {
    if (!saving) return;
    const timer = window.setTimeout(() => setSlow(true), 3000);
    return () => window.clearTimeout(timer);
  }, [saving]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim() || saving) return;
    setSaving(true);
    setSlow(false);
    setError('');
    try {
      const data = await getJson<{ nickname?: string }>(config.endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
        // 兜底：服务端自己 10 秒左右就会超时返回，这里只防止请求意外挂住
        signal: AbortSignal.timeout(30_000),
      });
      onSaved(data.nickname);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      setSlow(false);
      setError(timedOut ? '等了 30 秒还没有结果，请看运行 npm run dev 的终端里有没有报错' : err instanceof Error ? err.message : '保存失败');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="rounded-2xl border border-indigo-400/40 bg-indigo-500/5 p-4">
      <p className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
        <KeyRound size={16} className="text-indigo-500" /> {config.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {config.description}只保存在本机的 <code className={codeClass}>XHBlogs/.env.local</code>，不会被提交。
      </p>
      <div className="mt-3 flex gap-2">
        <input
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={config.placeholder}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClassName} font-mono`}
          aria-label={config.title}
        />
        <button
          type="submit"
          disabled={saving || !key.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-500 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          {saving && <Loader2 size={15} className="animate-spin" />} 验证并保存
        </button>
      </div>
      {slow && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{config.waitingText}</p>}
      {error && <p className="mt-2 text-sm font-bold text-red-500">{error}</p>}
      {onCancel && (
        <button type="button" onClick={onCancel} className="mt-2 text-xs font-bold text-slate-500 hover:underline dark:text-slate-400">
          {config.cancelText(saved)}
        </button>
      )}
    </form>
  );
}

export default function AnimeSearch({
  initialSection,
  credentials,
  onCredentialSaved,
  findExisting,
  onDraft,
  onOpenExisting,
  onManual,
  inputClassName,
}: AnimeSearchProps) {
  // 弹窗只在点击后挂载，不参与服务端渲染，可以直接读 localStorage
  const [section, setSection] = useState<MediaSection>(initialSection);
  const [source, setSource] = useState<SearchSource>(() => readSource(initialSection));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  /** 正在取详情的条目，用来在那一行显示转圈 */
  const [loadingKey, setLoadingKey] = useState('');
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<{ movie: AnimeInput; collection: { id: number; name: string } } | null>(null);
  /** 正在填写 / 更换哪个凭据 */
  const [editingCredential, setEditingCredential] = useState<CredentialService | null>(null);

  const switchSource = (next: SearchSource) => {
    setSource(next);
    setEditingCredential(null);
    setResults(null);
    setError('');
    try {
      localStorage.setItem(SOURCE_KEY[section], next);
    } catch {
      // 无痕模式等情况下存不了，不影响使用
    }
  };

  const switchSection = (next: MediaSection) => {
    if (next === section) return;
    setSection(next);
    setSource(readSource(next));
    setEditingCredential(null);
    setResults(null);
    setError('');
  };

  const finish = (draft: AnimeInput) => {
    const existing = findExisting(draft);
    if (existing) onOpenExisting(existing);
    else onDraft(draft);
  };

  const loadTmdb = async (type: TmdbType, id: number) => {
    setLoadingKey(`${type}-${id}`);
    setError('');
    try {
      const detail = await getJson<TmdbDetail>(`/api/anime/tmdb?type=${type}&id=${id}`);
      if (detail.collection && !findExisting(detail.draft)) setChoice({ movie: detail.draft, collection: detail.collection });
      else finish(detail.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取详情失败');
    } finally {
      setLoadingKey('');
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    const link = source === 'tmdb' ? parseTmdbLink(q) : null;
    if (link) {
      await loadTmdb(link.type, link.id);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getJson<{ results?: SearchResult[] }>(
        `/api/anime/search?source=${source}&section=${section}&q=${encodeURIComponent(q)}`,
      );
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const pick = (r: SearchResult) => {
    if (loadingKey) return;
    if (r.source !== 'tmdb') finish(inputFromSearch(r));
    else if (r.mediaType) {
      const existing = findExisting(idsOf(r));
      if (existing) onOpenExisting(existing);
      else void loadTmdb(r.mediaType, r.id);
    }
  };

  if (choice) {
    const busy = loadingKey !== '';
    return (
      <div>
        <button
          type="button"
          onClick={() => setChoice(null)}
          className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-indigo-500 dark:text-slate-400"
        >
          <ChevronLeft size={16} /> 返回搜索结果
        </button>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          《{choice.movie.title}》属于 <b>{choice.collection.name}</b>，要怎么记？
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadTmdb('collection', choice.collection.id)}
            className="flex items-start gap-3 rounded-2xl border border-indigo-400/60 bg-indigo-500/10 p-4 text-left transition-colors hover:bg-indigo-500/20 disabled:opacity-60"
          >
            {loadingKey === `collection-${choice.collection.id}` ? (
              <Loader2 size={20} className="mt-0.5 shrink-0 animate-spin text-indigo-500" />
            ) : (
              <Layers size={20} className="mt-0.5 shrink-0 text-indigo-500" />
            )}
            <span>
              <span className="block text-sm font-black text-slate-900 dark:text-white">整个系列一起追</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">一条记录，按「第几部」记进度</span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => finish(choice.movie)}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5"
          >
            <Film size={20} className="mt-0.5 shrink-0 text-slate-500" />
            <span>
              <span className="block text-sm font-black text-slate-900 dark:text-white">只添加这一部</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">单独记这部电影</span>
            </span>
          </button>
        </div>
        {error && <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}
      </div>
    );
  }

  const options = SOURCES[section];
  const current = options.find((s) => s.id === source) ?? options[0];
  // TMDB 必须有 Key 才能搜；Bangumi 登录是可选的，只在用户点了「登录」时出现
  const formService: CredentialService | null =
    source === 'tmdb' && (!credentials.tmdb || editingCredential === 'tmdb')
      ? 'tmdb'
      : source === 'bangumi' && editingCredential === 'bangumi'
        ? 'bangumi'
        : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="添加哪一类">
        {SECTION_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => switchSection(s)}
            aria-pressed={section === s}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${section === s ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
          >
            {SECTION_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="mb-3 flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="搜索来源">
        {options.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={source === s.id}
            onClick={() => switchSource(s.id)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${source === s.id ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {formService ? (
        <CredentialForm
          key={formService}
          service={formService}
          saved={credentials[formService]}
          inputClassName={inputClassName}
          onSaved={(nickname) => {
            setEditingCredential(null);
            setError('');
            setResults(null);
            onCredentialSaved(formService, nickname);
          }}
          // 第一次填 TMDB Key 时没有可退回的状态，不显示取消
          onCancel={formService === 'bangumi' || credentials.tmdb ? () => setEditingCredential(null) : undefined}
        />
      ) : (
        <form onSubmit={search} className="flex gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={current.hint}
            className={inputClassName}
            aria-label="搜索"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-500 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
          >
            {loading || loadingKey ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} 搜索
          </button>
        </form>
      )}
      {!formService && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {current.note}
          搜不到也可以
          <button type="button" onClick={() => onManual(query.trim(), section)} className="ml-1 font-bold text-indigo-500 hover:underline">
            手动填写
          </button>
          。
          {source !== 'openlibrary' && (
            <button
              type="button"
              onClick={() => setEditingCredential(source === 'tmdb' ? 'tmdb' : 'bangumi')}
              className="ml-2 font-bold text-slate-400 hover:text-indigo-500 hover:underline"
            >
              {source === 'tmdb' ? '更换 TMDB Key' : credentials.bangumi ? '已登录 Bangumi · 更换' : '登录 Bangumi（能搜到全部条目）'}
            </button>
          )}
        </p>
      )}

      {error && <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}

      {results && results.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">没有搜到，换个名字（原名 / 简称）试试，或者手动填写。</p>
      )}

      {results && results.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {results.map((r) => {
            const existing = findExisting(idsOf(r));
            const key = `${r.source}-${r.mediaType ?? ''}-${r.id}`;
            const spinning = loadingKey === `${r.mediaType}-${r.id}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  disabled={!!loadingKey}
                  className="flex w-full items-start gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait"
                >
                  <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
                    {r.cover && <AppImage src={r.cover} alt="" fill sizes="56px" className="object-cover" referrerPolicy="no-referrer" />}
                    {spinning && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 size={18} className="animate-spin text-white" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-900 dark:text-white">{r.title}</span>
                      {existing && (
                        <span className="shrink-0 rounded-full bg-indigo-500/15 px-2 py-px text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                          已添加 · {statusLabel(existing.status, existing.kind)}
                        </span>
                      )}
                    </p>
                    {r.originalTitle && r.originalTitle !== r.title && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.originalTitle}</p>
                    )}
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
                      {[
                        KIND_LABEL[r.kind],
                        r.creator,
                        r.platform && r.platform !== KIND_LABEL[r.kind] ? r.platform : '',
                        r.airDate.slice(0, 4),
                        r.totalEpisodes > 0 && r.kind !== 'movie' ? `${r.totalEpisodes} ${PROGRESS_UNIT[r.kind]}` : '',
                        r.score > 0 ? `${SOURCE_NAME[r.source]} ${r.score.toFixed(1)}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {r.summary && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500/90 dark:text-slate-400/90">{r.summary}</p>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
