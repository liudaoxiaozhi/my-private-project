// lib/navHistory.ts —— 浏览器前进 / 后退：判断方向，并把页面滚回离开时的位置（仅浏览器端使用）
//
// 为什么自己管滚动位置：站内换页时，浏览器在内容还没渲染出来、页面高度不够时就恢复滚动，
// 结果常常停在半路（列表页尤其明显）。这里改成手动：
// - 滚动时按「历史记录条目」记下位置（存在 sessionStorage，刷新后也还在）
// - 前进 / 后退时先记住目标位置，等对应页面渲染出来再滚过去；内容还在加载就多试几帧，读者一动就停
// - 刷新页面时同样恢复到刷新前的位置
// 换页动画用 consumeTraverse() 得知这次是不是前进 / 后退（见 components/RouteTransition.tsx）

export type NavDirection = 'push' | 'back' | 'forward';

interface PendingTraverse {
  direction: Exclude<NavDirection, 'push'>;
  path: string;
  y: number | null;
}

interface NavigationLike {
  currentEntry?: { key: string; index: number } | null;
}

const STORAGE_KEY = 'scroll-positions';
const MAX_ENTRIES = 60;
const RESTORE_MS = 1500;

let installed = false;
let positions: Record<string, number> = {};
let pending: PendingTraverse | null = null;
let knownIndex = -1;
let lastPath = '';
let restoring = false;
let cancelRestore: (() => void) | null = null;

function navigationApi(): NavigationLike | null {
  return (window as unknown as { navigation?: NavigationLike }).navigation ?? null;
}

/** 当前历史记录条目的标识：支持 Navigation API 时用条目 key（同一网址出现两次也能区分），否则用网址 */
function entryKey(): string {
  return navigationApi()?.currentEntry?.key ?? location.pathname + location.search + location.hash;
}

function currentIndex(): number {
  return navigationApi()?.currentEntry?.index ?? -1;
}

function load(): void {
  try {
    positions = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') as Record<string, number>;
  } catch {
    positions = {};
  }
}

let persistTimer = 0;
function persist(): void {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const keys = Object.keys(positions);
    if (keys.length > MAX_ENTRIES) for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete positions[k];
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch {
      /* 存不下就算了 */
    }
  }, 300);
}

function record(): void {
  if (restoring || pending) return;
  const key = entryKey();
  // 重新插到末尾，淘汰时先丢最久没用的
  delete positions[key];
  positions[key] = Math.round(window.scrollY);
  persist();
}

/** 滚到 y；页面还不够高（内容在加载）就每帧再试，直到到位或超时；读者自己动了就停 */
function restoreTo(y: number): void {
  cancelRestore?.();
  restoring = true;
  const started = performance.now();
  let frame = 0;
  let settled = 0;

  const stop = () => {
    cancelAnimationFrame(frame);
    USER_EVENTS.forEach((name) => window.removeEventListener(name, stop));
    restoring = false;
    cancelRestore = null;
    record();
  };
  const tick = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.min(y, Math.max(0, max)), behavior: 'instant' });
    settled = max >= y && Math.abs(window.scrollY - y) < 2 ? settled + 1 : 0;
    // 到位后再守几帧，防止图片之类撑开布局又把位置挤走
    if (settled > 4 || performance.now() - started > RESTORE_MS) return stop();
    frame = requestAnimationFrame(tick);
  };

  USER_EVENTS.forEach((name) => window.addEventListener(name, stop, { passive: true, once: true }));
  cancelRestore = stop;
  tick();
}

const USER_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

function onPopState(): void {
  const index = currentIndex();
  const direction = index >= 0 && knownIndex >= 0 && index > knownIndex ? 'forward' : 'back';
  knownIndex = index;
  const y = positions[entryKey()] ?? null;
  if (location.pathname === lastPath) {
    // 同一页里的前进后退（#小节、查询参数）：页面不用重新渲染，直接滚
    pending = null;
    if (y !== null) restoreTo(y);
    return;
  }
  pending = { direction, path: location.pathname, y };
}

/** 在根布局里挂一次：接管滚动恢复、开始记录位置；刷新后恢复到刷新前的位置 */
export function installNavHistory(): void {
  if (installed) return;
  installed = true;
  load();
  history.scrollRestoration = 'manual';
  knownIndex = currentIndex();
  lastPath = location.pathname;

  let frame = 0;
  window.addEventListener(
    'scroll',
    () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          record();
        });
    },
    { passive: true },
  );
  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', () => {
    knownIndex = currentIndex();
  });

  // 刷新 / 从别的网站后退回来：恢复离开时的位置（带 #小节 打开时交给浏览器跳到小节）
  const type = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  const saved = positions[entryKey()];
  if ((type === 'reload' || type === 'back_forward') && saved && !location.hash) restoreTo(saved);
}

/**
 * 换页渲染完成后调用（RouteTransition 里）：这次是不是浏览器前进 / 后退？
 * 是的话顺便把滚动位置恢复到离开时的地方。普通点链接进来返回 'push'。
 */
export function consumeTraverse(pathname: string): NavDirection {
  lastPath = pathname;
  knownIndex = currentIndex();
  const p = pending;
  pending = null;
  if (!p || p.path !== pathname) return 'push';
  if (p.y !== null) restoreTo(p.y);
  return p.direction;
}
