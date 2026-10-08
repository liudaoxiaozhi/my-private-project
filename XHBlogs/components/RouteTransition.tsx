"use client";
// components/RouteTransition.tsx —— 全站统一的换页入场动画（替代旧版每个页面各自包一层 PageTransition）
//
// - 放在根布局里，按路径变化触发，所有页面自动生效
// - 首次打开网站不播放（开屏动画已经负责入场），内容不必等脚本加载完才显示
// - 沉浸式页面（小说阅读、音乐）不播放；走共享元素视图过渡时也不播放
// - 用 useLayoutEffect 在绘制前启动，不会先闪一下完整页面
// - 方向不同动画不同：点链接进来从下往上浮起；浏览器后退从左边滑回，前进从右边滑入，
//   并且滚回离开时的位置（见 lib/navHistory.ts）

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { animate } from 'framer-motion';
import { isReaderPath } from '../lib/routes';
import { isViewTransitionNav } from '../lib/navTransition';
import { consumeTraverse, installNavHistory } from '../lib/navHistory';
import type { NavDirection } from '../lib/navHistory';

const ENTER_OFFSET = 20;
const SLIDE_OFFSET = 28;

function keyframes(direction: NavDirection) {
  if (direction === 'back') return { opacity: [0, 1], x: [-SLIDE_OFFSET, 0] };
  if (direction === 'forward') return { opacity: [0, 1], x: [SLIDE_OFFSET, 0] };
  return { opacity: [0, 1], y: [ENTER_OFFSET, 0] };
}

function shouldAnimate(pathname: string): boolean {
  return !isReaderPath(pathname) && pathname !== '/music';
}

export default function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const previousPath = useRef<string | null>(null);

  useEffect(() => installNavHistory(), []);

  useLayoutEffect(() => {
    const el = ref.current;
    const isFirstRender = previousPath.current === null;
    previousPath.current = pathname;
    if (isFirstRender) return;
    // 先恢复滚动位置再播动画，读者看到的第一帧就在原来的位置
    const direction = consumeTraverse(pathname);
    if (!el || !shouldAnimate(pathname) || isViewTransitionNav()) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const controls = animate(
      el,
      reduceMotion ? { opacity: [0, 1] } : keyframes(direction),
      { duration: reduceMotion ? 0.2 : direction === 'push' ? 0.6 : 0.45, ease: 'easeOut' },
    );
    // 动画中途又换页：直接跳到终点，避免页面停在半透明状态
    return () => controls.complete();
  }, [pathname]);

  return (
    <div ref={ref} data-route-content className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
