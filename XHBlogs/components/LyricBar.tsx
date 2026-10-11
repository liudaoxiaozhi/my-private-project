"use client";
import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { useMusic } from './MusicProvider';

/** 首页歌词栏：和其他卡片一样的浅色玻璃卡，左边主题色小音符，中间逐字打出当前歌词，下面一行歌名 · 歌手 */
export default function LyricBar() {
  const { isPlaying, currentLyric, currentSong } = useMusic();
  // 记下「打到了哪句的第几个字」；歌词一换，text 对不上就从空串重新开始，不用在 effect 里同步清空
  const [typed, setTyped] = useState({ text: '', count: 0 });

  useEffect(() => {
    if (!currentLyric) return;
    let i = 0;
    const typingInterval = setInterval(() => {
      i++;
      setTyped({ text: currentLyric, count: i });
      if (i >= currentLyric.length) clearInterval(typingInterval);
    }, 50);
    return () => clearInterval(typingInterval);
  }, [currentLyric]);

  if (!currentSong) return null;

  const displayedLyric = typed.text === currentLyric ? currentLyric.slice(0, typed.count) : '';
  const meta = [currentSong.title, currentSong.artist].filter(Boolean).join(' · ');

  return (
    <>
      <style>{`
        @keyframes lyricCursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .lyric-cursor {
          animation: lyricCursorBlink 0.8s step-end infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .lyric-cursor { animation: none; }
        }
      `}</style>

      <section
        aria-label="当前歌词"
        className="glass-card flex w-full items-center gap-3 px-5 py-3.5 transition-colors duration-700 sm:gap-4 sm:px-6"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 transition-opacity duration-500 dark:bg-indigo-400/15 dark:text-indigo-400 ${isPlaying ? '' : 'opacity-60'}`}
          aria-hidden="true"
        >
          <Music className="h-4 w-4" strokeWidth={2.2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-snug tracking-wide text-slate-800 sm:text-base dark:text-slate-100">
            {displayedLyric}
            <span className="lyric-cursor ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] rounded-full bg-indigo-500 dark:bg-indigo-400" aria-hidden="true"></span>
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
            {meta}
          </p>
        </div>

        <span className="hidden shrink-0 text-xs font-bold text-slate-500 sm:inline dark:text-slate-400">
          {isPlaying ? '播放中' : '已暂停'}
        </span>
      </section>
    </>
  );
}
