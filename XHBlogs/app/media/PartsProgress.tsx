'use client';
// app/media/PartsProgress.tsx —— 分季电视剧 / 系列电影的进度编辑
//
// 电视剧：选「第几季第几集」，下面列出每一季，点一下「看完这季」；
// 系列电影：每一部一行，点一下表示看到这一部（再点一次取消）。
import { Check, Minus, Plus } from 'lucide-react';
import {
  cumulativeProgress,
  locateProgress,
  progressThroughPart,
  type AnimePart,
} from '../../lib/anime';

interface PartsProgressProps {
  parts: AnimePart[];
  progress: number;
  isMovie: boolean;
  inputClassName: string;
  onChange: (progress: number) => void;
}

const stepButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

export default function PartsProgress({ parts, progress, isMovie, inputClassName, onChange }: PartsProgressProps) {
  const total = parts.reduce((sum, p) => sum + p.episodes, 0);

  if (isMovie) {
    return (
      <ol className="space-y-1.5">
        {parts.map((part, i) => {
          const watched = i < progress;
          return (
            <li key={`${i}-${part.title}`}>
              <button
                type="button"
                // 点已看的最后一部 = 取消；点其他 = 看到这一部
                onClick={() => onChange(watched && i === progress - 1 ? i : i + 1)}
                aria-pressed={watched}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${watched ? 'bg-indigo-500/10 text-slate-900 dark:text-white' : 'bg-slate-100/70 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${watched ? 'bg-indigo-500 text-white' : 'border border-slate-300 dark:border-slate-600'}`}
                >
                  {watched && <Check size={13} strokeWidth={3} />}
                </span>
                <span className="w-12 shrink-0 text-xs font-bold text-slate-400">第 {i + 1} 部</span>
                <span className="min-w-0 flex-1 truncate font-bold">{part.title}</span>
                {part.airDate && <span className="shrink-0 text-xs tabular-nums text-slate-400">{part.airDate.slice(0, 4)}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  const { index, episode } = locateProgress(parts, progress);
  // 刚好看完一季时，选择框显示下一季第 0 集更符合直觉
  const atSeasonEnd = progress > 0 && episode === parts[index]?.episodes && index < parts.length - 1;
  const season = atSeasonEnd ? index + 1 : index;
  const seasonEpisode = atSeasonEnd ? 0 : episode;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <button type="button" onClick={() => onChange(Math.max(0, progress - 1))} className={stepButton} aria-label="少看一集">
          <Minus size={16} />
        </button>
        <span>看到</span>
        <select
          value={season}
          onChange={(e) => onChange(cumulativeProgress(parts, Number(e.target.value), 0))}
          className={`${inputClassName} w-auto`}
          aria-label="第几季"
        >
          {parts.map((part, i) => (
            <option key={i} value={i}>
              第 {i + 1} 季
            </option>
          ))}
        </select>
        <span>第</span>
        <input
          inputMode="numeric"
          value={seasonEpisode || ''}
          placeholder="0"
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            onChange(cumulativeProgress(parts, season, Number.isFinite(n) ? n : 0));
          }}
          className={`${inputClassName} w-16 text-center tabular-nums`}
          aria-label="第几集"
        />
        <span>/ {parts[season]?.episodes ?? 0} 集</span>
        <button type="button" onClick={() => onChange(Math.min(total, progress + 1))} className={stepButton} aria-label="多看一集">
          <Plus size={16} />
        </button>
      </div>

      <ol className="mt-3 space-y-1.5">
        {parts.map((part, i) => {
          const end = progressThroughPart(parts, i);
          const start = end - part.episodes;
          const done = progress >= end;
          const watchedHere = Math.min(part.episodes, Math.max(0, progress - start));
          return (
            <li
              key={`${i}-${part.title}`}
              className="flex items-center gap-3 rounded-xl bg-slate-100/70 px-3 py-2 text-sm dark:bg-slate-800/60"
            >
              <span className="w-12 shrink-0 text-xs font-bold text-slate-400">第 {i + 1} 季</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold text-slate-800 dark:text-slate-100">{part.title}</span>
                <span className="ml-2 text-xs tabular-nums text-slate-400">
                  {part.episodes} 集{part.airDate ? ` · ${part.airDate.slice(0, 4)}` : ''}
                </span>
              </span>
              {done ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-indigo-500">
                  <Check size={13} strokeWidth={3} /> 看完
                </span>
              ) : (
                <>
                  {watchedHere > 0 && (
                    <span className="shrink-0 text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {watchedHere} / {part.episodes}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onChange(end)}
                    className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm hover:bg-indigo-500 hover:text-white dark:bg-slate-700 dark:text-slate-200"
                  >
                    看完这季
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
