'use client';
// app/anime/AnimeDetail.tsx —— 只读模式（线上 / 正式预览）下点开卡片看到的详情
import { ExternalLink, Star } from 'lucide-react';
import AnimeModal from './AnimeModal';
import { AnimeCover } from './AnimeCard';
import {
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  bangumiUrl,
  progressText,
  type AnimeEntry,
} from '../../lib/anime';

const dot = (d: string) => d.replace(/-/g, '.');

export default function AnimeDetail({ entry, onClose }: { entry: AnimeEntry; onClose: () => void }) {
  const dates = [
    entry.airDate && `${entry.kind === 'movie' ? '上映' : '首播'} ${dot(entry.airDate)}`,
    entry.startedAt && `开始看 ${dot(entry.startedAt)}`,
    entry.finishedAt && `看完 ${dot(entry.finishedAt)}`,
  ].filter(Boolean);

  return (
    <AnimeModal title={entry.title} onClose={onClose}>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-44">
          <AnimeCover entry={entry} sizes="176px" eager />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-black leading-snug text-slate-900 dark:text-white">{entry.title}</h3>
          {entry.originalTitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{entry.originalTitle}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className={`rounded-full px-2.5 py-1 ring-1 ${STATUS_STYLE[entry.status]}`}>{STATUS_LABEL[entry.status]}</span>
            <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-slate-600 dark:bg-white/10 dark:text-slate-300">{KIND_LABEL[entry.kind]}</span>
            <span className="rounded-full bg-slate-500/10 px-2.5 py-1 tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">{progressText(entry)}</span>
            {entry.rating > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 tabular-nums text-amber-700 dark:text-amber-300">
                <Star size={12} className="fill-current" /> {entry.rating} / 10
              </span>
            )}
          </div>

          {dates.length > 0 && <p className="mt-3 text-xs tabular-nums text-slate-500 dark:text-slate-400">{dates.join(' · ')}</p>}

          {entry.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <li key={tag} className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-300">
                  #{tag}
                </li>
              ))}
            </ul>
          )}

          {entry.comment && (
            <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-500/5 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:bg-white/5 dark:text-slate-200">
              {entry.comment}
            </p>
          )}

          {entry.bangumiId && (
            <a
              href={bangumiUrl(entry.bangumiId)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-500 hover:underline"
            >
              在 Bangumi 查看{entry.bangumiScore > 0 ? `（${entry.bangumiScore.toFixed(1)} 分）` : ''} <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </AnimeModal>
  );
}
