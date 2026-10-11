"use client";
// components/photo/useDevelopGuard.ts —— 「冲洗显影」的兜底（样式见 photo.css）
//
// 显影跟着滚动走（animation-timeline: view()）。页面太短滚不动、或者照片在页面最底下，
// 滚到头也走不完显影区间时，照片会一直停在半过曝的样子。这里在「已经滚到底」时把还没显影完的照片
// 从当前的样子平滑过渡到原图，并打上 data-developed，之后不再跟随滚动。

import { useEffect } from 'react';
import type { RefObject } from 'react';

const FINISH_MS = 900;

export function useDevelopGuard(rootRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    if (typeof CSS === 'undefined' || !CSS.supports('animation-timeline: view()')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const finish = () => {
      const doc = document.documentElement;
      if (window.scrollY + window.innerHeight < doc.scrollHeight - 2) return;
      root.querySelectorAll<HTMLElement>('[data-develop]:not([data-developed])').forEach((img) => {
        if (img.getBoundingClientRect().top >= window.innerHeight) return;
        const from = getComputedStyle(img).filter;
        img.setAttribute('data-developed', '');
        if (from && from !== 'none') {
          img.animate([{ filter: from }, { filter: 'none' }], { duration: FINISH_MS, easing: 'ease-out' });
        }
      });
    };

    let frame = 0;
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          finish();
        });
    };

    // 图片陆续加载会撑高页面，所以也盯着网格尺寸
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [rootRef, enabled]);
}
