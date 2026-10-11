"use client";
// components/photo/Lightbox.tsx —— 照片墙的灯箱
//
// - 打开 / 关闭：缩略图和大图之间走共享元素过渡（document.startViewTransition，名字 photo-zoom 只在过渡中挂上）；
//   浏览器不支持、开了「减少动态效果」时退回 framer-motion 的缩放淡入；「阅读」档不播动画
// - ← / → 切换，Esc 关闭；焦点锁在对话框里，关闭后回到对应的缩略图
// - 手机上左右滑动切换（阈值 50px）；打开时锁住背后页面的滚动；预加载前后两张
// - 大图没加载完之前先用缩略图顶着（同一张图、同样比例），加载完再淡入，过渡起点不会是空白
//
// 用法：缩略图是一个带 <img> 的可聚焦元素；点击时调 zoomIn(缩略图, commit)，在 commit 里把灯箱挂上，
// 灯箱挂载即打开，onClose 时卸载。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { canUseViewTransition } from '../../lib/navTransition';
import { getEffectsLevel } from '../../lib/effects';
import { useEffectsLevel } from '../EffectGate';
import './photo.css';

export interface LightboxPhoto {
  url: string;
  caption?: string;
  /** 所属相册（搜索结果里显示） */
  album?: string;
}

interface Preview {
  src: string;
  ratio: number;
}

interface LightboxProps {
  photos: LightboxPhoto[];
  startIndex: number;
  /** 是否已经通过共享元素过渡打开（是的话不再播 framer-motion 的入场动画） */
  zoomed: boolean;
  /** 第 i 张照片对应的缩略图（用来做过渡、关闭后还焦点） */
  getThumb: (index: number) => HTMLElement | null;
  onClose: () => void;
}

const VT_NAME = 'photo-zoom';
/** 等大图（或缩略图占位）解码的上限：过渡期间页面是冻住的，不能等太久 */
const DECODE_TIMEOUT = 350;
const FULL_DECODE_GRACE = 120;
const SWIPE_THRESHOLD = 50;
const EASE = [0.2, 0.8, 0.2, 1] as const;

function canZoom(): boolean {
  return canUseViewTransition() && getEffectsLevel() !== 'off';
}

function loadedImage(thumb: HTMLElement | null): HTMLImageElement | null {
  const img = thumb?.querySelector('img') ?? null;
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

function previewOf(thumb: HTMLElement | null): Preview | null {
  const img = loadedImage(thumb);
  return img ? { src: img.currentSrc || img.src, ratio: img.naturalWidth / img.naturalHeight } : null;
}

function lightboxFigure(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-lightbox-figure]');
}

function settle(img: HTMLImageElement | null, ms: number): Promise<void> {
  if (!img) return Promise.resolve();
  return Promise.race([img.decode().catch(() => undefined), new Promise<void>((r) => window.setTimeout(r, ms))]).then(() => undefined);
}

/** 从缩略图放大打开灯箱。commit 负责把灯箱挂上（setState），参数表示是否走了共享元素过渡 */
export function zoomIn(thumb: HTMLElement | null, commit: (zoomed: boolean) => void): void {
  const img = loadedImage(thumb);
  if (!thumb || !img || !canZoom()) {
    commit(false);
    return;
  }
  thumb.setAttribute('data-photo-zooming', '');
  img.style.viewTransitionName = VT_NAME;
  const transition = document.startViewTransition(async () => {
    // 旧画面已经截好：名字交给灯箱里的大图
    img.style.viewTransitionName = '';
    flushSync(() => commit(true));
    const figure = lightboxFigure();
    if (!figure) return;
    figure.style.viewTransitionName = VT_NAME;
    await settle(figure.querySelector<HTMLImageElement>('img[data-lightbox-preview]'), DECODE_TIMEOUT);
    // 原图如果马上就能解好就直接用原图，否则先由缩略图顶着
    await settle(figure.querySelector<HTMLImageElement>('img[data-lightbox-img]'), FULL_DECODE_GRACE);
  });
  transition.finished.finally(() => {
    thumb.removeAttribute('data-photo-zooming');
    const figure = lightboxFigure();
    if (figure) figure.style.viewTransitionName = '';
  });
}

const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])';

export default function Lightbox({ photos, startIndex, zoomed, getThumb, onClose }: LightboxProps) {
  const level = useEffectsLevel();
  const animated = level !== 'off';
  const count = photos.length;

  const [view, setView] = useState(() => ({
    index: startIndex,
    /** 切换方向：0 = 刚打开，1 = 下一张，-1 = 上一张 */
    dir: 0,
    preview: previewOf(getThumb(startIndex)),
  }));
  const [loaded, setLoaded] = useState<Record<string, true>>({});
  const [closing, setClosing] = useState(false);

  const { index, dir, preview } = view;
  const photo = photos[index] ?? photos[0];

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number; dx: number } | null>(null);
  /** 滑动结束后紧跟着的那次 click 不算「点空白处关闭」 */
  const swallowClickUntil = useRef(0);
  // 卸载时（关闭、浏览器后退）把焦点还给当前这张的缩略图
  const latest = useRef({ index, getThumb });
  useEffect(() => {
    latest.current = { index, getThumb };
  });

  // 打开：锁滚动、焦点移进对话框；关闭：还原
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus({ preventScroll: true });
    const ref = latest;
    return () => {
      document.body.style.overflow = previousOverflow;
      const { index: last, getThumb: thumbOf } = ref.current;
      (thumbOf(last) ?? opener)?.focus({ preventScroll: true });
    };
  }, []);

  // 预加载前后两张
  useEffect(() => {
    if (count < 2) return;
    for (const step of [1, -1]) {
      const next = photos[(index + step + count) % count];
      if (!next) continue;
      const img = new Image();
      img.src = next.url;
      img.decode().catch(() => undefined);
    }
  }, [index, photos, count]);

  const go = useCallback(
    (step: 1 | -1) => {
      if (count < 2) return;
      const nextIndex = (index + step + count) % count;
      setView({ index: nextIndex, dir: step, preview: previewOf(getThumb(nextIndex)) });
    },
    [count, index, getThumb],
  );

  const close = useCallback(() => {
    if (closing) return;
    const thumb = getThumb(index);
    const thumbImg = loadedImage(thumb);
    const figure = lightboxFigure();
    if (thumb && thumbImg && figure && canZoom()) {
      // 缩略图不在屏幕里就先悄悄滚过去（灯箱挡着，看不到），让大图缩回它真实的位置
      const rect = thumb.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) thumb.scrollIntoView({ block: 'center', behavior: 'instant' });
      figure.style.viewTransitionName = VT_NAME;
      thumb.setAttribute('data-photo-zooming', '');
      const transition = document.startViewTransition(() => {
        figure.style.viewTransitionName = '';
        thumbImg.style.viewTransitionName = VT_NAME;
        flushSync(onClose);
      });
      transition.finished.finally(() => {
        thumbImg.style.viewTransitionName = '';
        thumb.removeAttribute('data-photo-zooming');
      });
      return;
    }
    if (animated) setClosing(true);
    else onClose();
  }, [closing, getThumb, index, animated, onClose]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      go(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Tab') {
      // 焦点锁在对话框里
      const root = rootRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // —— 手机左右滑动 ——
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || count < 2) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0 };
    dragRef.current?.removeAttribute('data-settling');
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    s.dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (animated && dragRef.current && Math.abs(s.dx) > Math.abs(dy)) dragRef.current.style.translate = `${s.dx * 0.6}px 0`;
  };
  const endSwipe = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    swipe.current = null;
    const drag = dragRef.current;
    if (drag) {
      drag.setAttribute('data-settling', '');
      drag.style.translate = '';
    }
    const dy = e.clientY - s.y;
    if (cancelled || Math.abs(s.dx) < SWIPE_THRESHOLD || Math.abs(s.dx) < Math.abs(dy)) return;
    swallowClickUntil.current = e.timeStamp + 400;
    go(s.dx < 0 ? 1 : -1);
  };

  // 点空白处（遮罩、图片以外）关闭
  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.timeStamp < swallowClickUntil.current) return;
    if ((e.target as HTMLElement).closest('[data-lightbox-keep]')) return;
    close();
  };

  const enterFrom = dir === 0 ? (zoomed || !animated ? false : { opacity: 0, scale: 0.94 }) : animated ? { opacity: 0, x: dir * 48 } : false;
  const fullLoaded = loaded[photo.url] === true;
  const label = photo.caption || (photo.album ? `「${photo.album}」中的照片` : '照片');

  return createPortal(
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="照片查看器"
      data-lightbox
      tabIndex={-1}
      className="fixed inset-0 z-[10000] flex flex-col text-white outline-none"
      initial={zoomed || !animated ? false : { opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: closing ? 0.2 : 0.3, ease: 'easeOut' }}
      onAnimationComplete={() => {
        if (closing) onClose();
      }}
      onKeyDown={onKeyDown}
      onClick={onClick}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/95 backdrop-blur-2xl" />

      <div className="relative z-10 flex items-center justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
        <p data-lightbox-counter aria-live="polite" className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs tabular-nums tracking-wider text-white/80">
          {index + 1} / {count}
        </p>
        <button
          type="button"
          aria-label="关闭"
          data-lightbox-keep
          onClick={close}
          className="rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-4 sm:px-20"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endSwipe(e, false)}
        onPointerCancel={(e) => endSwipe(e, true)}
      >
        <div ref={dragRef} className="lb-drag flex h-full w-full items-center justify-center">
          <motion.div
            key={index}
            data-lightbox-figure
            data-lightbox-keep
            className="relative max-h-full max-w-full overflow-hidden rounded-lg shadow-2xl"
            style={preview ? { aspectRatio: preview.ratio, width: `min(100%, calc((100dvh - 11rem) * ${preview.ratio}))` } : undefined}
            initial={enterFrom}
            animate={closing ? { opacity: 0, scale: 0.96 } : { opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: closing ? 0.2 : 0.38, ease: EASE }}
          >
            {/* 灯箱展示原图，刻意保留原生 <img>，不经过尺寸压缩 */}
            {preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img data-lightbox-preview src={preview.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-lightbox-img
                  src={photo.url}
                  alt={label}
                  draggable={false}
                  onLoad={() => setLoaded((m) => (m[photo.url] ? m : { ...m, [photo.url]: true }))}
                  className={`lb-full absolute inset-0 h-full w-full object-contain ${fullLoaded ? 'opacity-100' : 'opacity-0'}`}
                />
              </>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img data-lightbox-img src={photo.url} alt={label} draggable={false} className="block max-h-[calc(100dvh-11rem)] max-w-full object-contain" />
            )}
          </motion.div>
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              data-lightbox-keep
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 sm:p-2.5 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:left-5"
            >
              <ChevronLeft size={26} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              data-lightbox-keep
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 sm:p-2.5 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:right-5"
            >
              <ChevronRight size={26} aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="relative z-10 flex min-h-[4.5rem] items-start justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {(photo.caption || photo.album) && (
          <p data-lightbox-caption className="max-w-2xl rounded-full border border-white/10 bg-white/10 px-5 py-2.5 text-center text-sm font-medium tracking-wide text-white shadow-2xl backdrop-blur-md">
            {photo.album && <span className="mr-2 text-xs font-bold text-indigo-300">{photo.album}</span>}
            {photo.caption}
          </p>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
