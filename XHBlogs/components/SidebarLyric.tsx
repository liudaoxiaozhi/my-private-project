"use client";
// components/SidebarLyric.tsx —— 文章 / 杂谈侧栏的「NOW PLAYING」：封面、歌名、打字机歌词，以及上一首 / 播放暂停 / 下一首和进度条。
// 这张卡在屏幕上时，桌宠台子上的迷你播放器收起来（lib/playerPresence.ts）。
import Link from 'next/link';
import { useMusic } from './MusicProvider';
import { useState, useEffect } from 'react';
import AppImage from './AppImage';
import { useFullPlayerRef } from '../lib/playerPresence';

const formatTime = (time: number) => {
  if (!time || isNaN(time)) return '00:00';
  const m = Math.floor(time / 60).toString().padStart(2, '0');
  const s = Math.floor(time % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function SidebarLyric() {
  const { currentSong, currentLyric, isPlaying, progress, currentTime, duration, togglePlay, prevSong, nextSong, handleSeek } = useMusic();
  const [displayedLyric, setDisplayedLyric] = useState("");
  const fullPlayerRef = useFullPlayerRef();

  useEffect(() => {
    setDisplayedLyric("");
    let i = 0;
    const targetText = currentLyric || "";
    if (!targetText) return;

    const typingInterval = setInterval(() => {
      if (i <= targetText.length) {
        setDisplayedLyric(targetText.slice(0, i));
        i++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, [currentLyric]);

  if (!currentSong) return null;

  return (
    <div ref={fullPlayerRef} className="glass-card p-6 transition-colors duration-700">
      <h3 className="lab-label font-black text-slate-900 dark:text-white mb-4 border-l-4 border-indigo-500 pl-2 text-sm">{isPlaying ? 'NOW PLAYING' : 'PAUSED'}</h3>

      <div className="flex items-center gap-4 mb-4">
        {/* 旋转封面 */}
        <div
          className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 shadow-md animate-[spin_6s_linear_infinite]"
          style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
        >
          <AppImage src={currentSong.cover} width={96} height={96} className="w-full h-full object-cover" alt="专辑封面" referrerPolicy="no-referrer" />
        </div>

        <Link href="/music" className="flex-1 overflow-hidden" title="去音乐页">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{currentSong.title}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{currentSong.artist}</p>
        </Link>
      </div>

      {/* 进度条 + 上一首 / 播放暂停 / 下一首 */}
      <div className="mb-4">
        <input
          type="range" min="0" max="100"
          value={progress}
          onChange={handleSeek}
          aria-label="播放进度"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
          style={{ background: `linear-gradient(to right, var(--color-indigo-400) ${progress}%, rgba(148,163,184,0.35) ${progress}%)` }}
        />
        <div className="mt-1 flex justify-between font-lab text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-6">
          <button type="button" onClick={prevSong} aria-label="上一首" className="text-slate-600 transition-colors hover:text-indigo-500 dark:text-slate-300 dark:hover:text-indigo-400">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? '暂停' : '播放'}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white shadow-md transition-transform hover:scale-110"
          >
            {isPlaying ? (
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button type="button" onClick={nextSong} aria-label="下一首" className="text-slate-600 transition-colors hover:text-indigo-500 dark:text-slate-300 dark:hover:text-indigo-400">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
          </button>
        </div>
      </div>

      {/* 歌词打字机 */}
      <div className="bg-slate-100/50 dark:bg-slate-900/50 p-3 rounded-xl min-h-[60px] flex items-center justify-center text-center shadow-inner">
        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
          {displayedLyric}
          <span className="inline-block w-[3px] h-3 ml-1 bg-indigo-500 animate-cursor align-middle"></span>
        </p>
      </div>

      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-cursor { animation: cursorBlink 0.8s step-end infinite; }
      `}</style>
    </div>
  );
}