'use client';
// app/media/MediaClient.tsx —— 书影音页主体：大类（全部 / 影视 / 书 / 音乐）、状态分栏、搜索排序、统计、卡片墙；
// 本地开发模式或登录网页后台后可添加 / 编辑
//
// 打开时的大类可以用 ?type=video|book|music（或 anime / movie / drama）指定；点分类时同步改地址栏，方便分享。
import { useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, Bookmark, Clapperboard, Filter, Headphones, LibraryBig, Plus, Search, SearchX } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import PageHeader, { FilterChip } from '../../components/PageHeader';
import { GLASS } from '../../components/novel/novelStyles';
import AnimeCard from './AnimeCard';
import MediaDialog, { type Dialog } from './MediaDialog';
import { useMediaLibrary, type MediaLibraryProps } from './useMediaLibrary';
import {
  KIND_LABEL,
  SECTION_DEFAULT_KIND,
  SECTION_KINDS,
  SECTION_LABEL,
  SECTION_ORDER,
  STATUS_ORDER,
  bumpProgress,
  isAnimeKind,
  sectionOf,
  statusLabel,
  toInput,
  withStatus,
  type AnimeEntry,
  type AnimeKind,
  type AnimeStatus,
  type MediaSection,
} from '../../lib/anime';

type Section = 'all' | MediaSection;
type KindFilter = 'all' | AnimeKind;
type Tab = 'all' | AnimeStatus;
type SortKey = 'updated' | 'created' | 'rating' | 'airDate' | 'title';

const SORT_KEYS: readonly SortKey[] = ['updated', 'created', 'rating', 'airDate', 'title'];

const AIR_DATE_SORT_LABEL: Record<Section, string> = { all: '发布时间', video: '首播时间', book: '出版时间', music: '发行时间' };

const sortLabel = (key: SortKey, section: Section): string =>
  key === 'airDate' ? AIR_DATE_SORT_LABEL[section] : { updated: '最近更新', created: '最近添加', rating: '我的评分', title: '标题' }[key];

const SORTERS: Record<SortKey, (a: AnimeEntry, b: AnimeEntry) => number> = {
  updated: (a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  rating: (a, b) => b.rating - a.rating || b.bangumiScore - a.bangumiScore,
  // 没填日期的排最后
  airDate: (a, b) => (b.airDate || '0').localeCompare(a.airDate || '0'),
  title: (a, b) => a.title.localeCompare(b.title, 'zh-CN'),
};

const SECTION_EMPTY: Record<MediaSection, { icon: ReactNode; title: string; description: string; add: string }> = {
  video: { icon: <Clapperboard size={28} />, title: '还没有影视记录', description: '番剧、电影、电视剧，在看的、想看的、看过的都记在这里。', add: '添加一部' },
  book: { icon: <BookOpen size={28} />, title: '书架还空着', description: '在读的、想读的、读过的书都记在这里。', add: '添加一本书' },
  music: { icon: <Headphones size={28} />, title: '还没有音乐记录', description: '专辑、单曲、原声带，在听的、想听的、听过的都可以记。', add: '添加一张专辑' },
};

const inSection = (e: AnimeEntry, s: Section): boolean => s === 'all' || sectionOf(e.kind) === s;

const SELECT =
  'rounded-full border-0 bg-white/60 py-1.5 pl-3 pr-8 text-sm font-bold text-slate-700 ring-1 ring-white/50 outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-slate-900/40 dark:text-slate-200 dark:ring-white/10';

/** ?type= → 大类 / 小类；认不出来时为全部 */
function parseType(search: string): { section: Section; kind: KindFilter } {
  const type = new URLSearchParams(search).get('type') ?? '';
  if ((SECTION_ORDER as readonly string[]).includes(type)) return { section: type as MediaSection, kind: 'all' };
  if (isAnimeKind(type)) {
    const section = sectionOf(type);
    return { section, kind: section === 'video' ? type : 'all' };
  }
  return { section: 'all', kind: 'all' };
}

// 地址栏只在打开页面时读一次（之后由点击决定），不需要订阅变化；服务端渲染时当作没有参数
const noopSubscribe = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => '';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/50 px-4 py-3 ring-1 ring-white/50 dark:bg-slate-900/30 dark:ring-white/10">
      <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

/** 影视下面的小类（番剧 / 电影 / 电视剧），比大类的标签轻一档 */
function SubChip({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
        active
          ? 'bg-indigo-500/15 text-indigo-600 ring-1 ring-indigo-500/30 dark:text-indigo-300'
          : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white'
      }`}
    >
      {children}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

const addButtonClass =
  'inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2';

export default function MediaClient(props: MediaLibraryProps) {
  const library = useMediaLibrary(props);
  const { entries, editable, busyId, quickUpdate } = library;

  const search = useSyncExternalStore(noopSubscribe, readSearch, serverSearch);
  const fromQuery = useMemo(() => parseType(search), [search]);
  /** 用户点过的分类；没点过时用地址栏里的 */
  const [picked, setPicked] = useState<{ section: Section; kind: KindFilter } | null>(null);
  const { section, kind } = picked ?? fromQuery;
  /** 用户点过的状态分栏；没点过时有「在看」就默认「在看」 */
  const [pickedTab, setPickedTab] = useState<Tab | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [dialog, setDialog] = useState<Dialog>(null);

  const sectionCounts = useMemo(() => {
    const c: Record<Section, number> = { all: entries.length, video: 0, book: 0, music: 0 };
    for (const e of entries) c[sectionOf(e.kind)] += 1;
    return c;
  }, [entries]);

  const kindCounts = useMemo(() => {
    const c = { anime: 0, movie: 0, drama: 0, book: 0, music: 0 } as Record<AnimeKind, number>;
    for (const e of entries) c[e.kind] += 1;
    return c;
  }, [entries]);

  /** 当前大类 + 小类下的条目（还没按状态和关键词筛） */
  const scoped = useMemo(
    () => entries.filter((e) => inSection(e, section) && (kind === 'all' || e.kind === kind)),
    [entries, section, kind],
  );

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: scoped.length, watching: 0, planned: 0, completed: 0, paused: 0 };
    for (const e of scoped) c[e.status] += 1;
    return c;
  }, [scoped]);

  const tab: Tab = pickedTab ?? (counts.watching > 0 ? 'watching' : 'all');

  const avgRating = useMemo(() => {
    const rated = scoped.filter((e) => e.rating > 0);
    return rated.length ? (rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(1) : '—';
  }, [scoped]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((e) => tab === 'all' || e.status === tab)
      .filter(
        (e) =>
          !q ||
          [e.title, e.originalTitle, e.creator, e.comment, e.wishReason].some((t) => t.toLowerCase().includes(q)) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort(SORTERS[sort]);
  }, [scoped, tab, query, sort]);

  /** 状态文案用哪个类型：全部时用中性的「看」 */
  const wordingKind: AnimeKind | undefined = section === 'all' ? undefined : kind !== 'all' ? kind : SECTION_DEFAULT_KIND[section];
  const defaultKind: AnimeKind = section === 'all' ? 'anime' : kind !== 'all' ? kind : SECTION_DEFAULT_KIND[section];

  const selectFilter = (next: { section: Section; kind: KindFilter }) => {
    setPicked(next);
    // 新分类下当前分栏是空的，就回到默认分栏，免得一切过去什么都没有
    if (pickedTab && pickedTab !== 'all') {
      const has = entries.some((e) => inSection(e, next.section) && (next.kind === 'all' || e.kind === next.kind) && e.status === pickedTab);
      if (!has) setPickedTab(null);
    }
    try {
      const url = next.section === 'all' ? window.location.pathname : `?type=${next.kind !== 'all' ? next.kind : next.section}`;
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // 改不了地址栏也不影响筛选
    }
  };

  const tabs: Tab[] = ['all', ...STATUS_ORDER];
  const plannedTotal = entries.filter((e) => e.status === 'planned').length;
  const openCreate = () => setDialog({ type: 'create' });

  const statLabels =
    section === 'all'
      ? { watching: '进行中', completed: '已完成', planned: '想看清单' }
      : { watching: statusLabel('watching', wordingKind), completed: statusLabel('completed', wordingKind), planned: statusLabel('planned', wordingKind) };

  let empty: ReactNode = null;
  if (visible.length === 0) {
    if (entries.length === 0) {
      empty = editable ? (
        <EmptyState
          className="mt-6"
          icon={<LibraryBig size={28} />}
          title="还没有书影音记录"
          description="搜一部番剧、电影、一本书或一张专辑加进来，进度、评分和想看清单都记在这里。"
          action={
            <button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600">
              <Plus size={15} strokeWidth={3} /> 添加第一部
            </button>
          }
        />
      ) : (
        <EmptyState
          className="mt-6"
          icon={<LibraryBig size={28} />}
          title="还没有书影音记录"
          description={
            <>
              登录后台{' '}
              <Link href="/admin" className="font-bold text-indigo-500 hover:underline dark:text-indigo-400">
                /admin
              </Link>{' '}
              后回到这一页，点「添加」就能搜影视、书和音乐；TMDB / Bangumi 密钥在后台的密钥板块里填。
            </>
          }
        />
      );
    } else if (section !== 'all' && sectionCounts[section] === 0) {
      const text = SECTION_EMPTY[section];
      empty = (
        <EmptyState
          className="mt-6"
          icon={text.icon}
          title={text.title}
          description={text.description}
          action={
            editable && (
              <button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600">
                <Plus size={15} strokeWidth={3} /> {text.add}
              </button>
            )
          }
        />
      );
    } else if (query.trim()) {
      empty = (
        <EmptyState
          className="mt-6"
          icon={<SearchX size={28} />}
          title={`没有找到「${query.trim()}」`}
          description="换个关键词试试，或者切到「全部」再搜。"
        />
      );
    } else {
      empty = <EmptyState className="mt-6" icon={<Filter size={28} />} title="这里还是空的" description="这个分栏下还没有记录，换一个看看。" />;
    }
  }

  return (
    <>
      <PageHeader
        title="书影音"
        icon={<LibraryBig size={30} />}
        subtitle={entries.length > 0 ? `读过的书、看过的影视、听过的音乐，共 ${entries.length} 部作品` : '还没有记录'}
        actions={
          <>
            <Link
              href="/media/wishlist"
              className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-white/50 transition-colors hover:bg-white/90 hover:text-indigo-600 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-700/70 dark:hover:text-indigo-300"
            >
              <Bookmark size={16} /> 想看清单
              {plannedTotal > 0 && <span className="text-xs tabular-nums text-slate-400">{plannedTotal}</span>}
            </Link>
            {editable && (
              <button type="button" onClick={openCreate} className={addButtonClass}>
                <Plus size={16} strokeWidth={3} /> 添加
              </button>
            )}
          </>
        }
      >
        {entries.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Stat label={statLabels.watching} value={counts.watching} />
            <Stat label={statLabels.completed} value={counts.completed} />
            <Stat label={statLabels.planned} value={counts.planned} />
            <Stat label="平均评分" value={avgRating} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="分类" className="flex flex-wrap gap-2">
            {(['all', ...SECTION_ORDER] as Section[]).map((s) => (
              <FilterChip key={s} active={section === s} count={sectionCounts[s]} onClick={() => selectFilter({ section: s, kind: 'all' })}>
                {s === 'all' ? '全部' : SECTION_LABEL[s]}
              </FilterChip>
            ))}
          </nav>
          {section === 'video' && (
            <nav aria-label="影视类型" className="flex flex-wrap items-center gap-1 sm:border-l sm:border-slate-400/30 sm:pl-2">
              {SECTION_KINDS.video.map((k) => (
                <SubChip key={k} active={kind === k} count={kindCounts[k]} onClick={() => selectFilter({ section: 'video', kind: kind === k ? 'all' : k })}>
                  {KIND_LABEL[k]}
                </SubChip>
              ))}
            </nav>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <nav aria-label="状态" className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-white/50 p-1 ring-1 ring-white/50 dark:bg-slate-900/30 dark:ring-white/10">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPickedTab(t)}
                aria-pressed={tab === t}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-bold transition-colors ${
                  tab === t
                    ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {t === 'all' ? '全部' : statusLabel(t, wordingKind)}
                <span className="text-xs tabular-nums opacity-60">{counts[t]}</span>
              </button>
            ))}
          </nav>
          {entries.length > 0 && (
            <>
              <label className="relative min-w-0 flex-1 basis-40">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索标题、作者、标签、短评"
                  aria-label="搜索书影音"
                  className="w-full rounded-full bg-white/60 py-1.5 pl-9 pr-3 text-sm text-slate-800 ring-1 ring-white/50 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400 dark:bg-slate-900/40 dark:text-slate-100 dark:ring-white/10"
                />
              </label>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序" className={SELECT}>
                {SORT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    按{sortLabel(k, section)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </PageHeader>

      {empty ?? (
        <section aria-label="书影音列表" className={`${GLASS} mt-6 p-3 sm:p-5`}>
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5">
            {visible.map((entry, i) => (
              <AnimeCard
                key={entry.id}
                entry={entry}
                eager={i < 5}
                editable={editable}
                busy={busyId === entry.id}
                onOpen={() => setDialog({ type: editable ? 'edit' : 'view', entry })}
                onBump={() => quickUpdate(entry, bumpProgress(toInput(entry)))}
                onFinish={() => quickUpdate(entry, withStatus(toInput(entry), 'completed'))}
              />
            ))}
          </ul>
        </section>
      )}

      {editable && (
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          编辑模式：改动保存在 <code className="rounded bg-black/5 px-1 dark:bg-white/10">data/anime.json</code>（整个书影音库，线上会提交到 GitHub），访客只能看不能改。
        </p>
      )}

      <MediaDialog
        library={library}
        dialog={dialog}
        setDialog={setDialog}
        defaultKind={defaultKind}
        onSaved={(saved, isEdit) => {
          if (isEdit) return;
          // 新加的条目切到它所在的分类和分栏，免得「添加了却看不到」
          if (!inSection(saved, section) || (kind !== 'all' && saved.kind !== kind)) selectFilter({ section: sectionOf(saved.kind), kind: 'all' });
          if (tab !== 'all' && tab !== saved.status) setPickedTab(saved.status);
        }}
      />
    </>
  );
}
