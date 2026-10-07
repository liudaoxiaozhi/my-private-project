'use client';
// app/anime/AnimeClient.tsx —— 追番页主体：统计、分栏、筛选、卡片墙；本地开发模式下可添加 / 编辑
import { useMemo, useState } from 'react';
import { Clapperboard, Plus, Search } from 'lucide-react';
import { GLASS } from '../../components/novel/novelStyles';
import { useToast } from '../../components/ToastProvider';
import AnimeCard from './AnimeCard';
import AnimeDetail from './AnimeDetail';
import AnimeEditor from './AnimeEditor';
import {
  KIND_LABEL,
  KIND_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  bumpProgress,
  toInput,
  withStatus,
  type AnimeEntry,
  type AnimeInput,
  type AnimeKind,
  type AnimeStatus,
} from '../../lib/anime';

type Tab = 'all' | AnimeStatus;
type SortKey = 'updated' | 'rating' | 'airDate' | 'title';

const SORT_LABEL: Record<SortKey, string> = {
  updated: '最近更新',
  rating: '我的评分',
  airDate: '首播时间',
  title: '标题',
};

const SORTERS: Record<SortKey, (a: AnimeEntry, b: AnimeEntry) => number> = {
  updated: (a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
  rating: (a, b) => b.rating - a.rating || b.bangumiScore - a.bangumiScore,
  // 没填日期的排最后
  airDate: (a, b) => (b.airDate || '0').localeCompare(a.airDate || '0'),
  title: (a, b) => a.title.localeCompare(b.title, 'zh-CN'),
};

const SELECT =
  'rounded-full border-0 bg-white/60 py-1.5 pl-3 pr-8 text-sm font-bold text-slate-700 ring-1 ring-white/50 outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-slate-900/40 dark:text-slate-200 dark:ring-white/10';

type Dialog = { type: 'create' } | { type: 'edit'; entry: AnimeEntry } | { type: 'view'; entry: AnimeEntry } | null;

async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  return data;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/50 px-4 py-3 ring-1 ring-white/50 dark:bg-slate-900/30 dark:ring-white/10">
      <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

export default function AnimeClient({ initialEntries, editable }: { initialEntries: AnimeEntry[]; editable: boolean }) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState(initialEntries);
  const [tab, setTab] = useState<Tab>(() => (initialEntries.some((e) => e.status === 'watching') ? 'watching' : 'all'));
  const [kind, setKind] = useState<'all' | AnimeKind>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: entries.length, watching: 0, planned: 0, completed: 0, paused: 0 };
    for (const e of entries) c[e.status] += 1;
    return c;
  }, [entries]);

  const stats = useMemo(() => {
    const episodes = entries.reduce((sum, e) => sum + (e.kind === 'movie' ? 0 : e.progress), 0);
    const movies = entries.filter((e) => e.kind === 'movie' && e.status === 'completed').length;
    const rated = entries.filter((e) => e.rating > 0);
    const avg = rated.length ? (rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(1) : '—';
    return { episodes, movies, avg };
  }, [entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => tab === 'all' || e.status === tab)
      .filter((e) => kind === 'all' || e.kind === kind)
      .filter(
        (e) =>
          !q ||
          e.title.toLowerCase().includes(q) ||
          e.originalTitle.toLowerCase().includes(q) ||
          e.comment.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort(SORTERS[sort]);
  }, [entries, tab, kind, query, sort]);

  const upsert = (entry: AnimeEntry) =>
    setEntries((list) => (list.some((e) => e.id === entry.id) ? list.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...list]));

  const findByBangumiId = (id: number) => entries.find((e) => e.bangumiId === id);

  const saveEntry = async (id: string | null, input: AnimeInput): Promise<AnimeEntry> => {
    const { entry } = id
      ? await request<{ entry: AnimeEntry }>(`/api/anime/${encodeURIComponent(id)}`, 'PUT', input)
      : await request<{ entry: AnimeEntry }>('/api/anime', 'POST', input);
    upsert(entry);
    return entry;
  };

  /** 卡片上的快捷操作（+1 集 / 电影标记看过） */
  const quickUpdate = async (entry: AnimeEntry, next: AnimeInput) => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      const saved = await saveEntry(entry.id, next);
      if (saved.status === 'completed' && entry.status !== 'completed') showToast(`《${saved.title}》看完啦 🎉`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const tabs: Tab[] = ['all', ...STATUS_ORDER];

  return (
    <>
      <header className={`${GLASS} px-5 py-6 sm:px-8 sm:py-8`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">
              <Clapperboard className="text-indigo-500" size={30} /> 追番
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {entries.length > 0 ? `在看、想看和看过的番剧与电影，共 ${entries.length} 部` : '还没有记录'}
            </p>
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => setDialog({ type: 'create' })}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
            >
              <Plus size={16} strokeWidth={3} /> 添加
            </button>
          )}
        </div>

        {entries.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Stat label="正在看" value={counts.watching} />
            <Stat label="已看完" value={counts.completed} />
            <Stat label={stats.movies > 0 ? `累计集数 · 另有 ${stats.movies} 部电影` : '累计看过的集数'} value={stats.episodes} />
            <Stat label="平均评分" value={stats.avg} />
          </div>
        )}

        <nav aria-label="状态" className="mt-5 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition-colors duration-300 ${tab === t ? 'bg-indigo-500 text-white ring-indigo-500 dark:bg-indigo-600' : 'bg-white/60 text-slate-700 ring-white/50 hover:bg-indigo-500 hover:text-white dark:bg-slate-900/40 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-indigo-600'}`}
            >
              {t === 'all' ? '全部' : STATUS_LABEL[t]}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[t]}</span>
            </button>
          ))}
        </nav>

        {entries.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-48">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题、标签、短评"
                aria-label="搜索追番"
                className="w-full rounded-full bg-white/60 py-1.5 pl-9 pr-3 text-sm text-slate-800 ring-1 ring-white/50 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400 dark:bg-slate-900/40 dark:text-slate-100 dark:ring-white/10"
              />
            </label>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'all' | AnimeKind)} aria-label="类型" className={SELECT}>
              <option value="all">全部类型</option>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序" className={SELECT}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  按{SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {visible.length === 0 ? (
        <div className={`${GLASS} mt-6 px-6 py-14 text-center text-sm text-slate-600 dark:text-slate-400`}>
          {entries.length === 0 ? (
            editable ? (
              <>
                <p>还没有追番记录。</p>
                <button
                  type="button"
                  onClick={() => setDialog({ type: 'create' })}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600"
                >
                  <Plus size={15} strokeWidth={3} /> 从 Bangumi 搜一部
                </button>
              </>
            ) : (
              <p>还没有追番记录。在本地运行「本地预览」就能在这个页面上添加。</p>
            )
          ) : (
            <p>这里还没有符合条件的番剧。</p>
          )}
        </div>
      ) : (
        <section aria-label="追番列表" className={`${GLASS} mt-6 p-3 sm:p-5`}>
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
                onFinishMovie={() => quickUpdate(entry, withStatus(toInput(entry), 'completed'))}
              />
            ))}
          </ul>
        </section>
      )}

      {editable && (
        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          本地编辑模式：改动直接保存在 <code className="rounded bg-black/5 px-1 dark:bg-white/10">data/anime.json</code>，线上只展示不能改。
        </p>
      )}

      {dialog?.type === 'view' && <AnimeDetail entry={dialog.entry} onClose={() => setDialog(null)} />}

      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <AnimeEditor
          // 换条目时重新挂载，表单状态不串
          key={dialog.type === 'edit' ? dialog.entry.id : 'create'}
          entry={dialog.type === 'edit' ? dialog.entry : null}
          findByBangumiId={findByBangumiId}
          onOpenExisting={(entry) => {
            showToast('这部已经添加过了，直接打开编辑', 'info');
            setDialog({ type: 'edit', entry });
          }}
          onSave={async (input) => {
            const isEdit = dialog.type === 'edit';
            const saved = await saveEntry(isEdit ? dialog.entry.id : null, input);
            setDialog(null);
            showToast(isEdit ? '已保存' : `已添加《${saved.title}》`, 'success');
            // 新加的条目切到它所在的分栏，免得「添加了却看不到」
            if (!isEdit && tab !== 'all' && tab !== saved.status) setTab(saved.status);
          }}
          onDelete={
            dialog.type === 'edit'
              ? async () => {
                  const { entry } = dialog;
                  await request(`/api/anime/${encodeURIComponent(entry.id)}`, 'DELETE');
                  setEntries((list) => list.filter((e) => e.id !== entry.id));
                  setDialog(null);
                  showToast(`已删除《${entry.title}》`, 'info');
                }
              : undefined
          }
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
