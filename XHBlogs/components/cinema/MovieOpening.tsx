'use client';
// components/cinema/MovieOpening.tsx —— 追番页点开「电影」时的片头：遮幅黑边滑入 → 片头字幕卡 → 露出详情面板
//
// 由 AnimeDetail 通过 AnimeModal 的 cinema 插槽渲染在遮罩之上、面板之下（同一个 portal）。
// 状态（开场中 / 已露出 / 退场中）放在 useMovieOpening 里，AnimeDetail 拿去同时驱动面板和这里的黑边。
// 档位：full 全部；lite 胶片颗粒不动；off 不渲染（由调用方判断）。
//
// e2e 可用的选择器：
//   [data-cinema-bar="top"|"bottom"]  黑边；data-phase="opening"|"shown"，退场时带 data-closing
//   [data-cinema-title-card]          片头字幕卡（aria-hidden）；data-tier="full"|"lite"
//   [data-cinema-skip]                「跳过」按钮（仅开场期间）
//   [data-cinema-catcher]             开场期间接住点击的透明层
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { siteConfig } from '../../siteConfig';
import type { AnimeEntry } from '../../lib/anime';
import './cinema.css';

/** 黑边滑入 + 字幕卡淡入 + 停留，到点自动露出面板 */
export const OPENING_MS = 2300;
/** 退场：黑边收回、面板淡出，和 cinema.css 里的 300ms 对齐（多留一点余量再卸载） */
export const CLOSING_MS = 320;

export type OpeningPhase = 'opening' | 'shown';

export interface MovieOpeningState {
  /** 正在播片头（面板藏着） */
  opening: boolean;
  /** 退场中（黑边收回，稍后才真正调用 onClose） */
  closing: boolean;
  phase: OpeningPhase;
  skip: () => void;
  /** 代替 onClose：先播退场，CLOSING_MS 后再卸载 */
  close: () => void;
}

/**
 * enabled 为 false（非电影 / 「阅读」档）时什么都不做，close 也不会被用到。
 * 只在定时器回调里改状态，不在 effect 里同步 setState。
 */
export function useMovieOpening(enabled: boolean, onClose: () => void): MovieOpeningState {
  const [phase, setPhase] = useState<OpeningPhase>('opening');
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setPhase('shown'), OPENING_MS);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => onCloseRef.current(), CLOSING_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const skip = useCallback(() => setPhase('shown'), []);
  const close = useCallback(() => setClosing(true), []);

  return { opening: enabled && phase === 'opening' && !closing, closing, phase, skip, close };
}

const SKIP_KEYS = new Set(['Escape', 'Enter', ' ', 'Spacebar']);

interface MovieOpeningProps {
  entry: AnimeEntry;
  tier: 'full' | 'lite';
  state: MovieOpeningState;
}

function metaLine(entry: AnimeEntry) {
  const year = /^\d{4}/.test(entry.airDate) ? entry.airDate.slice(0, 4) : '';
  const original = entry.originalTitle && entry.originalTitle !== entry.title ? entry.originalTitle : '';
  const parts: { key: string; node: ReactNode }[] = [];
  if (original) parts.push({ key: 'o', node: <i>{original}</i> });
  if (year) parts.push({ key: 'y', node: year });
  if (entry.rating > 0) parts.push({ key: 'r', node: `★ ${entry.rating} / 10` });
  return parts;
}

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function MovieOpening({ entry, tier, state }: MovieOpeningProps) {
  const { opening, closing, phase, skip } = state;

  // 开场期间：Esc / Enter / 空格 跳过（Esc 不再冒泡到 AnimeModal 的关闭监听）；Tab 也顺手跳过，免得焦点落在看不见的按钮上。
  // 挂在 window 捕获阶段，保证先于 AnimeModal 挂在 document 上的监听执行。
  useEffect(() => {
    if (!opening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab') {
        skip();
        return;
      }
      if (!SKIP_KEYS.has(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      skip();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [opening, skip]);

  // 点击时不让焦点离开对话框（鼠标按下默认会把焦点移到 body）
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  const meta = metaLine(entry);
  const barPhase = phase === 'opening' && !opening ? 'shown' : phase;

  return (
    <>
      {opening && (
        <div data-cinema-catcher="" className="cinema-catcher" aria-hidden="true" onMouseDown={keepFocus} onClick={skip} />
      )}

      <div
        data-cinema-bar="top"
        data-phase={barPhase}
        data-closing={closing ? '' : undefined}
        className="cinema-bar"
        aria-hidden="true"
      />
      <div
        data-cinema-bar="bottom"
        data-phase={barPhase}
        data-closing={closing ? '' : undefined}
        className="cinema-bar"
        aria-hidden="true"
      />

      <AnimatePresence>
        {opening && (
          <motion.div
            key="card"
            data-cinema-title-card=""
            data-tier={tier}
            className="cinema-card"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <div className="cinema-grain" />
            <div className="cinema-credits">
              <motion.p
                className="cinema-presents"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.35, ease: EASE_OUT }}
              >
                本片由 {siteConfig.authorName} 观影记录 呈现
              </motion.p>
              <motion.span
                className="cinema-rule"
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.7, delay: 0.45, ease: EASE_OUT }}
              />
              <motion.h2
                className="cinema-title"
                initial={{ opacity: 0, filter: 'blur(14px)', letterSpacing: '0.42em' }}
                animate={{ opacity: 1, filter: 'blur(0px)', letterSpacing: '0.16em' }}
                transition={{ duration: 1.05, delay: 0.5, ease: EASE_OUT }}
              >
                {entry.title}
              </motion.h2>
              {meta.length > 0 && (
                <motion.p
                  className="cinema-meta"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 1.0, ease: 'easeOut' }}
                >
                  {meta.map((m, i) => (
                    <span key={m.key}>
                      {i > 0 && <span aria-hidden="true"> · </span>}
                      {m.node}
                    </span>
                  ))}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {opening && (
          <motion.button
            key="skip"
            type="button"
            data-cinema-skip=""
            className="cinema-skip"
            // 只给鼠标 / 触屏用；键盘直接按 Esc / Enter / 空格 跳过，Tab 不会停在这里
            tabIndex={-1}
            aria-label="跳过片头"
            onMouseDown={keepFocus}
            onClick={skip}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3, delay: 0.45 }}
          >
            跳过
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
