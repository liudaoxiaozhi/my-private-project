'use client';
// app/media/wishlist/WishlistClient.tsx —— 想看清单：按优先级、加入时间排好的「想看 / 想读 / 想听」
//
// 能编辑时（本地开发 / 登录了网页后台）每张卡片有「开始看 / 开始读 / 开始听」、编辑、移除；访客只能看。
import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bookmark, CalendarDays, Filter, Loader2, MapPin, PencilLine, Play, Trash2 } from 'lucide-react';
import EmptyState from '../../../components/EmptyState';
import PageHeader, { FilterChip } from '../../../components/PageHeader';
import { AnimeCover } from '../AnimeCard';
import MediaDialog, { type Dialog } from '../MediaDialog';
import { useMediaLibrary, type MediaLibrary, type MediaLibraryProps } from '../useMediaLibrary';
import {
  DAY_MS,
  KIND_LABEL,
  PRIORITY_MAX,
  SECTION_LABEL,
  SECTION_ORDER,
  daysSince,
  sectionOf,
  toInput,
  verbOf,
  withStatus,
  type AnimeEntry,
  type MediaSection,
} from '../../../lib/anime';

type Section = 'all' | MediaSection;

/** 优先级高的在前，同级的新加的在前 */
const byPriority = (a: AnimeEntry, b: AnimeEntry): number => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt);

// 「加入 N 天」要用访客当天的日期：服务端（构建时）不渲染，水合后再显示，免得和构建时的日期对不上
const noopSubscribe = () => () => {};
const today = () => Math.floor(Date.now() / DAY_MS);
const serverToday = () => null;

const smallButton =
  'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50';

function Priority({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span className="shrink-0 text-sm font-black tracking-wider" aria-label={`优先级 ${value}`} title={`优先级 ${value} / ${PRIORITY_MAX}`}>
      <span className="text-amber-500">{'★'.repeat(value)}</span>
      <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(PRIORITY_MAX - value)}</span>
    </span>
  );
}

function WishCard({
  entry,
  library,
  day,
  confirming,
  onConfirm,
  onOpen,
}: {
  entry: AnimeEntry;
  library: MediaLibrary;
  day: number | null;
  confirming: boolean;
  onConfirm: (confirming: boolean) => void;
  onOpen: (type: 'view' | 'edit') => void;
}) {
  const { editable, busyId, quickUpdate, removeEntry, showToast } = library;
  const [removing, setRemoving] = useState(false);
  const verb = verbOf(entry.kind);
  const days = day === null ? null : daysSince(entry.createdAt, day);
  const busy = busyId === entry.id || removing;

  const remove = async () => {
    setRemoving(true);
    try {
      await removeEntry(entry);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
      setRemoving(false);
      onConfirm(false);
    }
  };

  return (
    <li data-reveal className="glass-card flex gap-4 p-4 transition-transform duration-300 ease-out hover:-translate-y-0.5">
      <button
        type="button"
        onClick={() => onOpen(editable ? 'edit' : 'view')}
        className="w-20 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:w-24"
        aria-label={`${entry.title}，${editable ? '编辑' : '查看详情'}`}
      >
        <AnimeCover entry={entry} sizes="96px" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-base font-black leading-snug text-slate-900 dark:text-white">{entry.title}</h3>
          <Priority value={entry.priority} />
        </div>
        <p className="mt-0.5 truncate text-xs font-bold text-slate-500 dark:text-slate-400">
          <span className="text-indigo-600 dark:text-indigo-300">{KIND_LABEL[entry.kind]}</span>
          {[entry.creator, entry.airDate.slice(0, 4)].filter(Boolean).map((t) => ` · ${t}`)}
        </p>

        {entry.wishReason && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{entry.wishReason}</p>}

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {entry.platform && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              <MapPin size={11} /> {entry.platform}
            </span>
          )}
          {days !== null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays size={11} /> {days === 0 ? '今天加入' : `加入 ${days} 天`}
            </span>
          )}
        </p>

        {editable && (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => quickUpdate(entry, withStatus(toInput(entry), 'watching'))}
              className={`${smallButton} bg-indigo-500 text-white shadow-sm hover:bg-indigo-600`}
            >
              {busyId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="fill-current" />}
              开始{verb}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpen('edit')}
              className={`${smallButton} text-slate-600 hover:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-white/10`}
            >
              <PencilLine size={12} /> 编辑
            </button>
            {confirming ? (
              <>
                <button type="button" disabled={busy} onClick={remove} className={`${smallButton} bg-red-500 text-white hover:bg-red-600`}>
                  {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} 确认移除
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onConfirm(false)}
                  className={`${smallButton} text-slate-500 hover:bg-slate-500/10 dark:text-slate-400 dark:hover:bg-white/10`}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm(true)}
                className={`${smallButton} text-red-500 hover:bg-red-500/10`}
              >
                <Trash2 size={12} /> 移除
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function WishlistClient(props: MediaLibraryProps) {
  const library = useMediaLibrary(props);
  const { entries } = library;
  const [section, setSection] = useState<Section>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  /** 正在确认移除的条目 */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const day = useSyncExternalStore(noopSubscribe, today, serverToday);

  const planned = useMemo(() => entries.filter((e) => e.status === 'planned').sort(byPriority), [entries]);

  const counts = useMemo(() => {
    const c: Record<Section, number> = { all: planned.length, video: 0, book: 0, music: 0 };
    for (const e of planned) c[sectionOf(e.kind)] += 1;
    return c;
  }, [planned]);

  const visible = section === 'all' ? planned : planned.filter((e) => sectionOf(e.kind) === section);

  return (
    <>
      <PageHeader
        title="想看清单"
        icon={<Bookmark size={30} />}
        subtitle={planned.length > 0 ? `想看、想读、想听的，按优先级排好，共 ${planned.length} 部` : '暂时没有想看的'}
        actions={
          <Link
            href="/media"
            className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-white/50 transition-colors hover:bg-white/90 hover:text-indigo-600 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-700/70 dark:hover:text-indigo-300"
          >
            <ArrowLeft size={16} /> 书影音
          </Link>
        }
      >
        <nav aria-label="分类" className="flex flex-wrap gap-2">
          {(['all', ...SECTION_ORDER] as Section[]).map((s) => (
            <FilterChip key={s} active={section === s} count={counts[s]} onClick={() => setSection(s)}>
              {s === 'all' ? '全部' : SECTION_LABEL[s]}
            </FilterChip>
          ))}
        </nav>
      </PageHeader>

      {visible.length === 0 ? (
        planned.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={<Bookmark size={28} />}
            title="想看清单是空的"
            description="在书影音里把状态设成「想看 / 想读 / 想听」，就会出现在这里。"
            action={
              <Link href="/media" className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600">
                去书影音看看
              </Link>
            }
          />
        ) : (
          <EmptyState
            className="mt-6"
            icon={<Filter size={28} />}
            title={`没有${section === 'book' ? '想读的书' : section === 'music' ? '想听的音乐' : '想看的影视'}`}
            description="换一个分类看看。"
          />
        )
      ) : (
        <ul aria-label="想看清单" className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((entry) => (
            <WishCard
              key={entry.id}
              entry={entry}
              library={library}
              day={day}
              confirming={confirmId === entry.id}
              onConfirm={(on) => setConfirmId(on ? entry.id : null)}
              onOpen={(type) => setDialog({ type, entry })}
            />
          ))}
        </ul>
      )}

      <MediaDialog library={library} dialog={dialog} setDialog={setDialog} />
    </>
  );
}
