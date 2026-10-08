"use client";
// components/CoverTransition.tsx —— 共享元素过渡：点卡片时封面平滑放大成目标页的头图
//
// 用浏览器原生的 document.startViewTransition（Chrome / Edge / Safari 18+）；
// 不支持的浏览器、开启「减少动态效果」时，点击照常由 next/link 跳转，没有任何区别。
//
// 约定：
// - 卡片封面图加 data-vt-cover；封面在链接里面，或者链接和封面同在一个 data-vt-card 容器里（首页轮播）
// - 目标页头图加 data-vt-hero（文章页、杂谈页）
// 名字只在过渡期间挂上（见 globals.css），平时页面上不会出现重名。

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { canUseViewTransition, setViewTransitionNav } from '../lib/navTransition';

const NAME = 'vt-hero';
/** 等新页面渲染出来的上限；超时就让过渡退化成普通淡入淡出 */
const RENDER_TIMEOUT = 2500;
/** 等头图解码的上限 */
const DECODE_TIMEOUT = 400;

function waitUntil(check: () => boolean, timeout: number): Promise<void> {
  // 过渡期间页面暂停绘制，requestAnimationFrame 不一定会跑，用 setTimeout 轮询
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (check() || Date.now() - started > timeout) resolve();
      else window.setTimeout(tick, 16);
    };
    tick();
  });
}

function findCover(anchor: HTMLAnchorElement): HTMLElement | null {
  return (
    anchor.querySelector<HTMLElement>('[data-vt-cover]') ??
    anchor.closest('[data-vt-card]')?.querySelector<HTMLElement>('[data-vt-cover]') ??
    null
  );
}

export default function CoverTransition() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement).closest?.<HTMLAnchorElement>('a[href]');
      if (!anchor || (anchor.target && anchor.target !== '_self')) return;
      const cover = findCover(anchor);
      if (!cover || !canUseViewTransition()) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;

      // 接管这次跳转（next/link 看到 defaultPrevented 就不再处理）
      e.preventDefault();
      const root = document.documentElement;
      cover.style.viewTransitionName = NAME;
      setViewTransitionNav(true);

      const transition = document.startViewTransition(async () => {
        // 旧画面已经截好：去掉旧封面的名字，改由新页面的头图接上
        cover.style.viewTransitionName = '';
        root.dataset.vtPhase = 'new';
        router.push(url.pathname + url.search + url.hash);
        await waitUntil(() => window.location.pathname === url.pathname && !cover.isConnected, RENDER_TIMEOUT);
        const hero = document.querySelector<HTMLImageElement>('img[data-vt-hero]');
        if (hero) await Promise.race([hero.decode().catch(() => undefined), new Promise((r) => window.setTimeout(r, DECODE_TIMEOUT))]);
      });
      transition.finished.finally(() => {
        delete root.dataset.vtPhase;
        setViewTransitionNav(false);
      });
    };

    // 捕获阶段：在 next/link 的点击处理之前接管
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [router]);

  return null;
}
