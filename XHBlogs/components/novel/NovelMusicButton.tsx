"use client";
// components/novel/NovelMusicButton.tsx —— 小说页面里的背景音乐按钮（播放 / 暂停 + 下一首）
//
// 颜色用 currentColor 继承外层，书页（毛玻璃）和阅读器（四种底色）都能直接用。

import { Music2, Pause, Play, SkipForward } from 'lucide-react';
import { useMusic } from '../MusicProvider';

interface NovelMusicButtonProps {
  /** 是否显示当前歌名（窄屏可以只显示图标） */
  showTitle?: boolean;
  className?: string;
}

export default function NovelMusicButton({ showTitle = true, className = '' }: NovelMusicButtonProps) {
  const { currentSong, isPlaying, togglePlay, nextSong, playlist } = useMusic();
  if (!currentSong || playlist.length === 0) return null;

  return (
    <div className={`flex items-center gap-0.5 rounded-full ${className}`}>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? `暂停音乐：${currentSong.title}` : `播放音乐：${currentSong.title}`}
        title={isPlaying ? '暂停音乐' : '播放音乐'}
        className="flex h-9 min-w-9 items-center gap-2 rounded-full px-2.5 transition-colors duration-300 ease-out hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
      >
        {isPlaying ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} />}
        {showTitle && (
          <span className="flex max-w-[11rem] items-center gap-1.5 truncate text-[13px]">
            <Music2 size={13} className={`shrink-0 opacity-60 ${isPlaying ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span className="truncate">{currentSong.title}</span>
          </span>
        )}
      </button>
      {playlist.length > 1 && (
        <button
          type="button"
          onClick={nextSong}
          aria-label="下一首"
          title="下一首"
          className="flex h-9 w-9 items-center justify-center rounded-full opacity-70 transition-all duration-300 ease-out hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
        >
          <SkipForward size={15} fill="currentColor" strokeWidth={0} />
        </button>
      )}
    </div>
  );
}
