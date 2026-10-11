"use client";
// components/photo/Viewfinder.tsx —— 相册网格上的「取景框」悬停效果
//
// - 只在「完整」档 + 鼠标设备（pointer: fine）+ 没开「减少动态效果」时挂载；其余情况直接不渲染，也不挂监听
// - 放在网格外层（position: relative）里，作为网格的兄弟节点；照片元素带 data-photo-index
// - 四角对焦框跟着鼠标缓动（rAF 插值），整个网格只有一个 pointermove 监听；
//   鼠标停住约 400ms 后框收紧、播一下「对焦」，照片右下角显示说明（没有就用相册名）+ 相册日期
// - 覆盖层 pointer-events: none、绝对定位，不影响点击和布局
// 样式见 photo.css「取景框」。

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEffectsLevel } from '../EffectGate';
import './photo.css';

interface ViewfinderProps {
  /** 与网格里 data-photo-index 对应的说明文字 */
  captions: (string | undefined)[];
  albumTitle: string;
  date?: string;
}

const REST_MS = 400;
const REST_SLOP = 6;
const LERP = 0.22;
/** 指针停下后再追几帧，跟上照片悬停上浮之类的小位移 */
const SETTLE_MS = 450;
const HUD_INSET = 10;

const FINE_POINTER = '(pointer: fine)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeMedia(onChange: () => void): () => void {
  const queries = [window.matchMedia(FINE_POINTER), window.matchMedia(REDUCED_MOTION)];
  queries.forEach((q) => q.addEventListener('change', onChange));
  return () => queries.forEach((q) => q.removeEventListener('change', onChange));
}
const canHover = () => window.matchMedia(FINE_POINTER).matches && !window.matchMedia(REDUCED_MOTION).matches;

export default function Viewfinder(props: ViewfinderProps) {
  const level = useEffectsLevel();
  const hover = useSyncExternalStore(subscribeMedia, canHover, () => false);
  if (level !== 'full' || !hover) return null;
  return <ViewfinderLayer {...props} />;
}

function clamp(v: number, min: number, max: number): number {
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v));
}

function ViewfinderLayer({ captions, albumTitle, date }: ViewfinderProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const frame = frameRef.current;
    const hud = hudRef.current;
    const host = layer?.parentElement;
    if (!layer || !frame || !hud || !host) return;
    host.setAttribute('data-viewfinder', '');

    let active: HTMLElement | null = null;
    let raf = 0;
    let restTimer = 0;
    let placed = false;
    let x = 0;
    let y = 0;
    let radius = 44;
    let pointerX = 0;
    let pointerY = 0;
    let restX = 0;
    let restY = 0;
    let settleUntil = 0;

    const unfocus = () => {
      window.clearTimeout(restTimer);
      frame.removeAttribute('data-focused');
    };

    const restart = () => {
      unfocus();
      restX = pointerX;
      restY = pointerY;
      restTimer = window.setTimeout(() => {
        if (active) frame.setAttribute('data-focused', '');
      }, REST_MS);
    };

    const tick = () => {
      raf = 0;
      if (!active) return;
      const box = host.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      const left = rect.left - box.left;
      const top = rect.top - box.top;
      // 框中心跟着指针，但整个框留在照片里面
      const tx = clamp(pointerX - box.left, left + radius, left + rect.width - radius);
      const ty = clamp(pointerY - box.top, top + radius, top + rect.height - radius);
      if (!placed) {
        x = tx;
        y = ty;
        placed = true;
      } else {
        x += (tx - x) * LERP;
        y += (ty - y) * LERP;
      }
      frame.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      hud.style.transform = `translate3d(${(left + rect.width - HUD_INSET).toFixed(1)}px, ${(top + rect.height - HUD_INSET).toFixed(1)}px, 0)`;
      hud.style.maxWidth = `${Math.max(0, rect.width - HUD_INSET * 2)}px`;
      const moving = Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3;
      if (moving || performance.now() < settleUntil) raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      settleUntil = performance.now() + SETTLE_MS;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const setActive = (photo: HTMLElement | null) => {
      if (photo === active) return;
      const wasIdle = !active;
      active = photo;
      if (!photo) {
        unfocus();
        layer.removeAttribute('data-active');
        setHovered(null);
        return;
      }
      const rect = photo.getBoundingClientRect();
      // 框的大小随照片走：大照片大框，小照片小框
      radius = clamp(Math.min(rect.width, rect.height) * 0.2, 26, 54);
      frame.style.setProperty('--vf-r-open', `${radius.toFixed(1)}px`);
      frame.style.setProperty('--vf-r-tight', `${(radius * 0.66).toFixed(1)}px`);
      if (wasIdle) placed = false;
      layer.setAttribute('data-active', '');
      setHovered(Number(photo.dataset.photoIndex));
      restart();
    };

    const photoAt = (target: EventTarget | null): HTMLElement | null => {
      const photo = target instanceof Element ? target.closest<HTMLElement>('[data-photo-index]') : null;
      return photo && host.contains(photo) ? photo : null;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      pointerX = e.clientX;
      pointerY = e.clientY;
      const photo = photoAt(e.target);
      if (photo !== active) setActive(photo);
      else if (photo && Math.hypot(pointerX - restX, pointerY - restY) > REST_SLOP) restart();
      if (active) kick();
    };
    const onLeave = () => setActive(null);
    // 滚动时指针下面换了照片（指针本身没动，不会有 pointermove）
    const onScroll = () => {
      if (!active) return;
      setActive(photoAt(document.elementFromPoint(pointerX, pointerY)));
      if (active) kick();
    };

    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(restTimer);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      host.removeAttribute('data-viewfinder');
    };
  }, []);

  const caption = hovered === null ? '' : captions[hovered] || albumTitle;

  return (
    <div ref={layerRef} className="vf-layer" aria-hidden="true" data-viewfinder-layer>
      <div ref={frameRef} className="vf-frame">
        <span className="vf-corner" data-c="tl" />
        <span className="vf-corner" data-c="tr" />
        <span className="vf-corner" data-c="bl" />
        <span className="vf-corner" data-c="br" />
        <span className="vf-pulse" />
        <span className="vf-label font-mono font-bold">对焦</span>
      </div>
      <div
        ref={hudRef}
        className="vf-hud glass-chip flex items-center gap-2 px-2.5 py-1 font-mono text-[11px] leading-tight text-slate-700 dark:text-slate-200"
      >
        <span className="min-w-0 truncate">{caption}</span>
        {date && <span className="shrink-0 tabular-nums text-indigo-600 dark:text-indigo-300">{date}</span>}
      </div>
    </div>
  );
}
