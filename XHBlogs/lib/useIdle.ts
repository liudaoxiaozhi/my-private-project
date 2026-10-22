// lib/useIdle.ts —— 推迟挂载用的两个开关（配合 components/LazyFx.tsx）
//
// useIdle()：首屏水合完、浏览器第一次空闲之后变成 true（requestIdleCallback，最多等 1.5 秒；
//   不支持的浏览器用 setTimeout 等 1.5 秒），之后一直是 true，站内换页不用再等。
// useDesktopSeen()：窗口宽度曾经达到电脑端（≥ 768px，和 Tailwind 的 md: 一致）后为 true，之后不再变回 false。
//   外面本来就套着 hidden md:block 的组件（桌宠、工具箱……）在手机上就不用下载；
//   窗口缩小时保持挂载，和原来只靠 CSS 隐藏时一样（打开的面板、桌宠的状态都不丢）。
// 两个都用 useSyncExternalStore 订阅（不在 effect 里 setState）；服务端渲染和水合时都是 false。
import { useSyncExternalStore } from 'react';

const IDLE_TIMEOUT = 1500;

let idle = false;
let idleScheduled = false;
const idleListeners = new Set<() => void>();

function markIdle(): void {
  idle = true;
  idleListeners.forEach((notify) => notify());
}

function subscribeIdle(onChange: () => void): () => void {
  idleListeners.add(onChange);
  if (!idleScheduled) {
    idleScheduled = true;
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(markIdle, { timeout: IDLE_TIMEOUT });
    else window.setTimeout(markIdle, IDLE_TIMEOUT);
  }
  return () => {
    idleListeners.delete(onChange);
  };
}

/** 页面是否已经空闲过一次（首屏要紧的事做完了） */
export function useIdle(): boolean {
  return useSyncExternalStore(subscribeIdle, () => idle, () => false);
}

const DESKTOP_QUERY = '(min-width: 768px)';
let desktopSeen = false;

function getDesktopSeen(): boolean {
  // 只会从 false 变成 true，多读几次结果也一样
  if (!desktopSeen) desktopSeen = window.matchMedia(DESKTOP_QUERY).matches;
  return desktopSeen;
}

function subscribeDesktop(onChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** 窗口是否曾经达到电脑端宽度（达到过就一直是 true） */
export function useDesktopSeen(): boolean {
  return useSyncExternalStore(subscribeDesktop, getDesktopSeen, () => false);
}
