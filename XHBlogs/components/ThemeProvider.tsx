"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { THEME_STORAGE_KEY } from '../lib/theme';

type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 兜底：若 <html> 的 class 被意外重置（如开发环境热更新），按本地记录恢复
  useEffect(() => {
    const stored = readStoredTheme();
    if ((stored === 'dark') !== getSnapshot()) applyTheme(stored);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemeName = getSnapshot() ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 隐私模式等场景写入失败时，本次会话内仍然生效 */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ isDark, toggleTheme }), [isDark, toggleTheme]);

  // 不再在挂载前隐藏整页：服务端输出的 HTML 首屏即可见，利于 LCP 与 SEO
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
