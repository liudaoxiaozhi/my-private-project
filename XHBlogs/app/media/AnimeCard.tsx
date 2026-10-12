'use client';
// app/media/AnimeCard.tsx —— 书影音卡片与封面
import { useState } from 'react';
import { Check, Plus, Star } from 'lucide-react';
import AppImage from '../../components/AppImage';
import {
  KIND_LABEL,
  PROGRESS_UNIT,
  STATUS_STYLE,
  hasParts,
  isSingleMovie,
  progressRatio,
  progressText,
  quickAction,
  statusLabel,
  verbOf,
  type AnimeEntry,
} from '../../lib/anime';

const PROGRESS_NOUN: Record<string, string> = { 看: '观看', 读: '阅读', 听: '收听' };

/** 封面；没有图片或图片加载失败时用标题首字做占位 */
export function AnimeCover({
  entry,
  sizes,
  eager = false,
  className = '',
}: {
  entry: Pick<AnimeEntry, 'title' | 'cover'>;
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  // 记下加载失败的地址：换了封面地址会自动重试
  const [failedSrc, setFailedSrc] = useState('');
  return (
    <div className={`relative aspect-[3/4] overflow-hidden rounded-xl bg-gradient-to-br from-indigo-400/40 via-sky-300/30 to-pink-300/40 shadow-md dark:from-indigo-900/60 dark:via-slate-800 dark:to-pink-900/40 ${className}`}>
      {entry.cover && failedSrc !== entry.cover ? (
        <AppImage
          src={entry.cover}
          alt={`${entry.title} 封面`}
          fill
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          className="object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(entry.cover)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-4xl font-black text-white/80 drop-shadow" aria-hidden="true">
          {Array.from(entry.title)[0] ?? '?'}
        </span>
      )}
    </div>
  );
}

interface AnimeCardProps {
  entry: AnimeEntry;
  eager: boolean;
  editable: boolean;
  busy: boolean;
  onOpen: () => void;
  /** 「+1 集 / 部 / 首」 */
  onBump: () => void;
  /** 直接标记看过 / 读过 / 听过 */
  onFinish: () => void;
}

export default function AnimeCard({ entry, eager, editable, busy, onOpen, onBump, onFinish }: AnimeCardProps) {
  const ratio = progressRatio(entry);
  const singleMovie = isSingleMovie(entry);
  const action = editable ? quickAction(entry) : null;
  const bumpLabel = `1 ${PROGRESS_UNIT[entry.kind]}`;
  const verb = verbOf(entry.kind);
  const status = statusLabel(entry.status, entry.kind);
  const year = entry.airDate.slice(0, 4);
  // 书和专辑没填总数时没有进度可画
  const showBar = !singleMovie && (entry.totalEpisodes > 0 || entry.status === 'completed' || (entry.kind !== 'book' && entry.kind !== 'music'));

  return (
    <li data-glow data-tilt data-reveal className="group flex h-full flex-col rounded-2xl p-2 transition-all duration-300 ease-out hover:-translate-y-1 hover:bg-white/45 dark:hover:bg-white/5 sm:p-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-xl"
        aria-label={`${entry.title}，${status}${editable ? '，点击编辑' : '，查看详情'}`}
      >
        <div className="relative w-full">
          <AnimeCover
            entry={entry}
            eager={eager}
            sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
            className="w-full transition-shadow duration-300 group-hover:shadow-[0_22px_44px_-12px_rgba(0,0,0,0.5)]"
          />
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 backdrop-blur-md ${STATUS_STYLE[entry.status]} bg-white/80 dark:bg-slate-900/70`}>
            {status}
          </span>
          {entry.rating > 0 && (
            <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-slate-900/70 px-2 py-0.5 text-[11px] font-black tabular-nums text-amber-300 backdrop-blur-md">
              <Star size={11} className="fill-current" aria-hidden="true" />
              {entry.rating}
            </span>
          )}
        </div>
        <h3 className="mt-3 line-clamp-2 text-[15px] font-black leading-snug text-slate-900 dark:text-white">{entry.title}</h3>
        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
          {[KIND_LABEL[entry.kind], entry.creator, hasParts(entry) ? `${entry.parts.length} ${entry.kind === 'movie' ? '部' : '季'}` : '', year]
            .filter(Boolean)
            .join(' · ')}
          {entry.originalTitle && <span className="opacity-80"> · {entry.originalTitle}</span>}
        </p>
      </button>

      <div className="mt-auto pt-2.5">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          <span className="truncate tabular-nums">{progressText(entry)}</span>
          {action === 'bump' && (
            <button
              type="button"
              onClick={onBump}
              disabled={busy}
              title={`${verb}完${bumpLabel}`}
              className="flex shrink-0 items-center gap-0.5 rounded-full bg-indigo-500 px-2 py-0.5 text-[11px] font-black text-white shadow-sm transition-all hover:bg-indigo-600 active:scale-95 disabled:opacity-50"
            >
              <Plus size={12} strokeWidth={3} /> {bumpLabel}
            </button>
          )}
          {action === 'finish' && (
            <button
              type="button"
              onClick={onFinish}
              disabled={busy}
              className="flex shrink-0 items-center gap-0.5 rounded-full bg-indigo-500 px-2 py-0.5 text-[11px] font-black text-white shadow-sm transition-all hover:bg-indigo-600 active:scale-95 disabled:opacity-50"
            >
              <Check size={12} strokeWidth={3} /> {verb}过
            </button>
          )}
        </div>
        {showBar && (
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-500/15 dark:bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-label={`${PROGRESS_NOUN[verb] ?? '观看'}进度`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${entry.status === 'completed' ? 'bg-indigo-500' : 'bg-emerald-500'}`}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        )}
      </div>
    </li>
  );
}
