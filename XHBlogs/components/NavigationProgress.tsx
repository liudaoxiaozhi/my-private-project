"use client";
// components/NavigationProgress.tsx —— 站内跳转时顶部的加载进度条
//
// - 点击站内链接、浏览器前进 / 后退时开始，地址变化（新页面渲染）后走完并淡出
// - 页面秒开时不显示：等待超过 SHOW_DELAY 才出现，避免一闪而过
// - 样式与文章页的阅读进度条一致

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Phase = 'idle' | 'loading' | 'done';

const SHOW_DELAY = 120;
const FADE_OUT = 400;
/** 兜底：迟迟没有完成（例如跳转失败）时自动收起 */
const GIVE_UP = 12000;

/** 这次点击会不会触发一次站内换页 */
function isInternalNavigation(e: MouseEvent): boolean {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const anchor = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return false;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin && url.pathname !== window.location.pathname;
}

export default function NavigationProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const [prevPath, setPrevPath] = useState(pathname);
  const startTimer = useRef<number | undefined>(undefined);
  const giveUpTimer = useRef<number | undefined>(undefined);

  // 地址变了 = 新页面已经渲染：进度条走完（在渲染期间根据新旧地址调整状态，是 React 推荐的写法）
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    if (phase === 'loading') setPhase('done');
  }

  useEffect(() => {
    window.clearTimeout(startTimer.current);
    window.clearTimeout(giveUpTimer.current);
  }, [pathname]);

  useEffect(() => {
    if (phase !== 'done') return;
    const timer = window.setTimeout(() => setPhase('idle'), FADE_OUT);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const start = () => {
      window.clearTimeout(startTimer.current);
      window.clearTimeout(giveUpTimer.current);
      startTimer.current = window.setTimeout(() => {
        setPhase('loading');
        giveUpTimer.current = window.setTimeout(() => setPhase('done'), GIVE_UP);
      }, SHOW_DELAY);
    };
    const onClick = (e: MouseEvent) => {
      if (isInternalNavigation(e)) start();
    };
    // 捕获阶段监听：next/link 自己会 preventDefault 再用客户端路由跳转，冒泡阶段就分不清了
    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', start);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', start);
      window.clearTimeout(startTimer.current);
      window.clearTimeout(giveUpTimer.current);
    };
  }, []);

  if (phase === 'idle') return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]" role="progressbar" aria-label="页面加载中" aria-busy={phase === 'loading'}>
      <div
        className={`h-full origin-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] ${
          phase === 'loading' ? 'animate-[nav-progress_8s_cubic-bezier(0.1,0.7,0.2,1)_forwards]' : 'scale-x-100 opacity-0 transition-[transform,opacity] duration-300'
        }`}
      />
    </div>
  );
}
