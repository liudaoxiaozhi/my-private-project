"use client";
// app/music/QueuePanel.tsx —— 播放列表（Apple Music「接下来播放」风格）

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import AppImage from '../../components/AppImage';
import type { Song } from '../../lib/music';

interface QueuePanelProps {
  playlist: Song[];
  currentId: string | undefined;
  isPlaying: boolean;
  onPlay: (index: number) => void;
}

export default function QueuePanel({ playlist, currentId, isPlaying, onPlay }: QueuePanelProps) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return playlist
      .map((song, index) => ({ song, index }))
      .filter(({ song }) => !q || song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q));
  }, [playlist, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end justify-between gap-4 px-2 pb-4">
        <div>
          <h2 className="text-xl text-white">播放列表</h2>
          <p className="mt-0.5 text-sm text-white/50">共 {playlist.length} 首</p>
        </div>
        <label className="relative w-44 max-w-[50%]">
          <span className="sr-only">搜索歌曲</span>
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/45" />
          <input
            id="am-queue-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索"
            className="h-8 w-full rounded-lg bg-white/10 pl-8 pr-7 text-sm text-white placeholder:text-white/40 outline-none transition-colors duration-300 focus:bg-white/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清除搜索" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-white/50 hover:text-white">
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      <ul className="am-lyrics-scroller flex-1 overflow-y-auto overscroll-contain pb-6">
        {rows.map(({ song, index }) => {
          const isCurrent = song.id === currentId;
          return (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => onPlay(index)}
                aria-current={isCurrent ? 'true' : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${isCurrent ? 'bg-white/12' : 'hover:bg-white/6'}`}
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white/10 shadow-md">
                  <AppImage src={song.cover} alt="" fill sizes="44px" className="object-cover" referrerPolicy="no-referrer" />
                  {isCurrent && (
                    <span className="am-eq absolute inset-0 flex items-end justify-center gap-[3px] bg-black/45 pb-2.5" data-paused={!isPlaying}>
                      <span className="h-3 w-[3px] rounded-full bg-white" />
                      <span className="h-3 w-[3px] rounded-full bg-white" />
                      <span className="h-3 w-[3px] rounded-full bg-white" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15px] ${isCurrent ? 'font-semibold text-white' : 'text-white/90'}`}>{song.title}</span>
                  <span className="block truncate text-[13px] text-white/50">{song.artist}</span>
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && <li className="px-2 py-10 text-center text-sm text-white/45">没有找到匹配的歌曲</li>}
      </ul>
    </div>
  );
}
