"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { THEME_STORAGE_KEY } from '../lib/theme';
import { canUseViewTransition } from '../lib/navTransition';

type ThemeName = 'light' | 'dark';

/** 圆形扩散的圆心（视口坐标），一般是点击位置 */
export interface ThemeToggleOrigin {
  x: number;
  y: number;
}

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: (origin?: ThemeToggleOrigin) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ isDark: true, toggleTheme: () => {} });

function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function readStoredTheme(): ThemeName {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

// —— 以 <html> 的 class 作为唯一数据源，useSyncExternalStore 订阅它 ——
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const getSnapshot = (): boolean => document.documentElement.classList.contains('dark');
/** 服务端渲染时按默认深色输出；客户端若是浅色，React 会在水合后自动重渲染，不会报 Hydration 错误 */
const getServerSnapshot = (): boolean => true;

const REVEAL_DURATION = 650;
/** 切换期间关闭全站的颜色过渡，新主题一次画好，由圆形扩散负责动画 */
const SWITCHING_CLASS = 'theme-switching';

function saveTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* 隐私模式等场景写入失败时，本次会话内仍然生效 */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 兜底：若 <html> 的 class 被意外重置（如开发环境热更新），按本地记录恢复
  useEffect(() => {
    const stored = readStoredTheme();
    if ((stored === 'dark') !== getSnapshot()) applyTheme(stored);
  }, []);

  // 支持视图过渡的浏览器：新主题从点击位置圆形扩散开；其他浏览器直接切换
  const toggleTheme = useCallback((origin?: ThemeToggleOrigin) => {
    const next: ThemeName = getSnapshot() ? 'light' : 'dark';
    const commit = () => {
      applyTheme(next);
      saveTheme(next);
    };
    if (!canUseViewTransition()) {
      commit();
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const root = document.documentElement;
    root.classList.add(SWITCHING_CLASS);

    const transition = document.startViewTransition(() => {
      commit();
      // 等 React 根据新主题重渲染（日夜图标等）后再截取新画面
      return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    });
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: REVEAL_DURATION, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {
        /* 过渡被跳过时主题照样已经切换 */
      });
    transition.finished.finally(() => root.classList.remove(SWITCHING_CLASS));
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ isDark, toggleTheme }), [isDark, toggleTheme]);

  // 不再在挂载前隐藏整页：服务端输出的 HTML 首屏即可见，利于 LCP 与 SEO
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
