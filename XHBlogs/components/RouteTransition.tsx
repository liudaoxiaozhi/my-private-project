"use client";
// components/RouteTransition.tsx —— 全站统一的换页入场动画（替代旧版每个页面各自包一层 PageTransition）
//
// - 放在根布局里，按路径变化触发，所有页面自动生效
// - 首次打开网站不播放（开屏动画已经负责入场），内容不必等脚本加载完才显示
// - 沉浸式页面（小说阅读、音乐）不播放；走共享元素视图过渡时也不播放
// - 用 useLayoutEffect 在绘制前启动，不会先闪一下完整页面

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { animate } from 'framer-motion';
import { isReaderPath } from '../lib/routes';
import { isViewTransitionNav } from '../lib/navTransition';

const ENTER_OFFSET = 20;

function shouldAnimate(pathname: string): boolean {
  return !isReaderPath(pathname) && pathname !== '/music';
}

export default function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const previousPath = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const isFirstRender = previousPath.current === null;
    previousPath.current = pathname;
    if (!el || isFirstRender || !shouldAnimate(pathname) || isViewTransitionNav()) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const controls = animate(
      el,
      reduceMotion ? { opacity: [0, 1] } : { opacity: [0, 1], y: [ENTER_OFFSET, 0] },
      { duration: reduceMotion ? 0.2 : 0.6, ease: 'easeOut' },
    );
    // 动画中途又换页：直接跳到终点，避免页面停在半透明状态
    return () => controls.complete();
  }, [pathname]);

  return (
    <div ref={ref} className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
