"use client";
// app/music/LyricsPanel.tsx —— Apple Music 风格歌词
//
// - 当前行逐字点亮：网易云有逐字歌词（yrc）时用每个字的真实时间，普通 LRC 按整行时长估算到每个字（lib/lyrics.ts）
// - 逐字进度在两次 timeupdate 之间用 requestAnimationFrame 按真实时间插值，直接写 CSS 变量，不触发重渲染
// - 译文跟原文在同一行（小一号）；「作词 / 作曲」这类署名行更小更淡
// - 其他行变淡，离当前行越远越模糊；前奏 / 长间奏显示三个呼吸的小圆点；点击任意行跳到该处
// - 用户手动滚动时暂停自动滚动并取消模糊，3 秒无操作后恢复

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LyricLine } from '../../lib/music';
import { isCreditLine, lineEnd, lineTokens } from '../../lib/lyrics';
import { clamp } from './musicUtils';

interface LyricsPanelProps {
  lyrics: LyricLine[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeekTime: (seconds: number) => void;
  /** 没有歌词时显示的文字 */
  emptyText: string;
}

/** 当前行停在可视区域的这个高度比例处（Apple 放在偏上的位置） */
const ANCHOR_RATIO = 0.3;
const USER_SCROLL_IDLE_MS = 3000;
/** 两句之间空出这么久（秒）才算间奏，显示小圆点 */
const INTERLUDE_MIN = 4;
/** timeupdate 停了（缓冲）时最多往前估算这么久，免得歌词跑到声音前面 */
const MAX_EXTRAPOLATE = 1.2;

function InterludeDots({ progress }: { progress: number }) {
  return (
    <div className="am-dots flex items-center gap-2.5 px-3 py-3" aria-hidden="true">
      {[0, 1, 2].map((k) => (
        <i key={k} style={{ opacity: 0.22 + 0.78 * clamp(progress * 3 - k, 0, 1) }} />
      ))}
    </div>
  );
}

export default function LyricsPanel({ lyrics, currentTime, duration, isPlaying, onSeekTime, emptyText }: LyricsPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [userScrolling, setUserScrolling] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  /** 最近一次收到的播放时间和收到它的时刻，逐字动画据此插值 */
  const clock = useRef({ time: currentTime, at: 0 });

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

  // 前奏（第一句之前）或长间奏（这句唱完到下一句之间）：after = 圆点画在哪一行后面，-1 表示最前面
  const interlude = useMemo(() => {
    if (!synced) return null;
    if (activeIndex < 0) {
      const first = lyrics[0]?.time ?? 0;
      return first >= INTERLUDE_MIN && currentTime < first - 0.3 ? { after: -1, start: 0, end: first } : null;
    }
    const next = lyrics[activeIndex + 1];
    if (!next) return null;
    const end = lineEnd(lyrics, activeIndex, duration);
    const open = next.time - end >= INTERLUDE_MIN && currentTime > end + 0.4 && currentTime < next.time - 0.3;
    return open ? { after: activeIndex, start: end, end: next.time } : null;
  }, [synced, activeIndex, lyrics, currentTime, duration]);

  // 间奏时当前行已经唱完，跟其他行一样变淡
  const litIndex = interlude ? -1 : activeIndex;
  const tokens = useMemo(() => (litIndex < 0 ? [] : lineTokens(lyrics, litIndex, duration)), [lyrics, litIndex, duration]);

  useEffect(() => {
    clock.current = { time: currentTime, at: performance.now() };
  }, [currentTime]);

  // 逐字点亮：每帧按插值后的时间给每个字写 --w（填充位置），唱过的字标 data-sung，正在唱的标 data-on
  const pausedAt = isPlaying ? 0 : currentTime;
  useEffect(() => {
    if (tokens.length === 0) return;
    let raf = 0;
    const paint = () => {
      const { time, at } = clock.current;
      const t = isPlaying ? time + Math.min((performance.now() - at) / 1000, MAX_EXTRAPOLATE) : time;
      tokens.forEach((w, i) => {
        const el = wordRefs.current[i];
        if (!el) return;
        const p = clamp((t - w.start) / Math.max(w.end - w.start, 0.05), 0, 1);
        el.style.setProperty('--w', `${(p * 130 - 30).toFixed(1)}%`);
        el.toggleAttribute('data-sung', p >= 1);
        el.toggleAttribute('data-on', p > 0 && p < 1);
      });
      if (isPlaying) raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [tokens, isPlaying, pausedAt]);

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

  const dots = interlude && (
    <InterludeDots progress={clamp((currentTime - interlude.start) / Math.max(interlude.end - interlude.start, 0.1), 0, 1)} />
  );

  return (
    <div
      ref={scrollerRef}
      onWheel={markUserScroll}
      onTouchMove={markUserScroll}
      className="am-lyrics-scroller am-lyrics-mask relative h-full overflow-y-auto overscroll-contain"
    >
      <div className="flex flex-col gap-[clamp(0.9rem,2.2vh,1.6rem)] px-2 pb-[60vh] pt-[22vh]">
        {interlude?.after === -1 && dots}
        {lyrics.map((line, i) => {
          const isLit = i === litIndex;
          const credit = isCreditLine(line.text);
          const distance = activeIndex < 0 ? 3 : Math.abs(i - activeIndex);
          const blurPx = !synced || userScrolling || isLit ? 0 : Math.min(distance, 5) * 0.8;
          const style: CSSProperties = {
            opacity: !synced ? 0.85 : isLit ? 1 : userScrolling ? 0.6 : credit ? 0.22 : 0.3,
            filter: blurPx ? `blur(${blurPx}px)` : 'none',
            transform: isLit || !synced ? 'scale(1)' : 'scale(0.96)',
          };

          return (
            <div key={`${i}-${line.time}`} className="contents">
              <button
                ref={(el) => { lineRefs.current[i] = el; }}
                type="button"
                disabled={!synced}
                onClick={() => onSeekTime(line.time)}
                style={style}
                className={`am-line block w-full rounded-2xl px-3 py-1.5 text-left hover:!opacity-80 hover:!blur-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-default ${isLit ? 'am-line-active hover:!opacity-100' : 'cursor-pointer'}`}
                aria-current={isLit ? 'true' : undefined}
              >
                <span
                  className={`am-line-text block font-bold tracking-[-0.01em] text-white ${
                    credit ? 'text-[clamp(1rem,1.3vw,1.2rem)] leading-snug' : 'text-[clamp(1.45rem,2.35vw,2.15rem)] leading-[1.3]'
                  }`}
                >
                  {isLit && tokens.length > 0
                    ? tokens.map((w, k) => (
                        <span
                          key={k}
                          ref={(el) => { wordRefs.current[k] = el; }}
                          className={/^\s+$/.test(w.text) ? 'am-w am-w-space' : 'am-w'}
                          data-long={w.end - w.start >= 1 ? '' : undefined}
                        >
                          {w.text}
                        </span>
                      ))
                    : line.text}
                </span>
                {line.translation && (
                  <span className="am-line-trans mt-1.5 block text-[clamp(1rem,1.45vw,1.3rem)] font-semibold leading-snug text-white">
                    {line.translation}
                  </span>
                )}
              </button>
              {interlude?.after === i && dots}
            </div>
          );
        })}
      </div>
    </div>
  );
}
