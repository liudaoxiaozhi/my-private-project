"use client";
// app/music/LyricsPanel.tsx —— Apple Music 风格歌词
//
// - 当前行全亮，并按这一行的播放进度从左到右填亮（LRC 只有行级时间，用整行进度模拟）
// - 其他行变淡，离当前行越远越模糊；点击任意行跳到该处
// - 用户手动滚动时暂停自动滚动并取消模糊，3 秒无操作后恢复

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LyricLine } from '../../lib/music';
import { clamp } from './musicUtils';

interface LyricsPanelProps {
  lyrics: LyricLine[];
  currentTime: number;
  duration: number;
  onSeekTime: (seconds: number) => void;
  /** 没有歌词时显示的文字 */
  emptyText: string;
}

/** 当前行停在可视区域的这个高度比例处（Apple 放在偏上的位置） */
const ANCHOR_RATIO = 0.3;
const USER_SCROLL_IDLE_MS = 3000;

export default function LyricsPanel({ lyrics, currentTime, duration, onSeekTime, emptyText }: LyricsPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [userScrolling, setUserScrolling] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);

  const synced = lyrics.length > 0 && lyrics.every((l) => l.time >= 0);

  const activeIndex = useMemo(() => {
    if (!synced) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, currentTime, synced]);

  // 当前行内的播放进度 0~100，驱动从左到右的填充
  const fillPercent = useMemo(() => {
    if (activeIndex < 0) return 0;
    const start = lyrics[activeIndex].time;
    const end = lyrics[activeIndex + 1]?.time ?? (duration > start ? duration : start + 5);
    return clamp(((currentTime - start) / Math.max(end - start, 0.001)) * 100, 0, 100);
  }, [activeIndex, lyrics, currentTime, duration]);

  // 当前行变化时平滑滚动到锚点位置
  useEffect(() => {
    if (userScrolling || activeIndex < 0) return;
    const scroller = scrollerRef.current;
    const line = lineRefs.current[activeIndex];
    if (!scroller || !line) return;
    scroller.scrollTo({ top: line.offsetTop - scroller.clientHeight * ANCHOR_RATIO, behavior: 'smooth' });
  }, [activeIndex, userScrolling]);

  // 换歌时回到顶部
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
    lineRefs.current = [];
  }, [lyrics]);

  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const markUserScroll = () => {
    setUserScrolling(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setUserScrolling(false), USER_SCROLL_IDLE_MS);
  };

  if (lyrics.length === 0) {
    return (
      <div className="flex h-full items-center px-2">
        <p className="text-[clamp(1.5rem,2.4vw,2.2rem)] font-bold leading-snug text-white/40">{emptyText}</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      onWheel={markUserScroll}
      onTouchMove={markUserScroll}
      className="am-lyrics-scroller am-lyrics-mask relative h-full overflow-y-auto overscroll-contain"
    >
      <div className="flex flex-col gap-[clamp(0.9rem,2.2vh,1.6rem)] px-2 pb-[60vh] pt-[22vh]">
        {lyrics.map((line, i) => {
          const isActive = i === activeIndex;
          const distance = activeIndex < 0 ? 3 : Math.abs(i - activeIndex);
          const blurPx = !synced || userScrolling || isActive ? 0 : Math.min(distance, 5) * 0.7;
          const style = {
            opacity: !synced ? 0.85 : isActive ? 1 : userScrolling ? 0.6 : 0.32,
            filter: blurPx ? `blur(${blurPx}px)` : 'none',
            transform: isActive || !synced ? 'scale(1)' : 'scale(0.97)',
            ...(isActive ? { '--am-fill': `${fillPercent}%` } : {}),
          } as CSSProperties;

          return (
            <button
              key={`${i}-${line.time}`}
              ref={(el) => { lineRefs.current[i] = el; }}
              type="button"
              disabled={!synced}
              onClick={() => onSeekTime(line.time)}
              style={style}
              className={`am-line block w-full rounded-xl px-3 py-1 text-left hover:!opacity-80 hover:!blur-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-default ${isActive ? 'am-line-active hover:!opacity-100' : 'cursor-pointer'}`}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="am-line-text text-[clamp(1.45rem,2.35vw,2.15rem)] font-bold leading-[1.28] tracking-[-0.01em] text-white">
                {line.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
