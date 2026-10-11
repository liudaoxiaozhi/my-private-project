"use client";

import { SunMoon } from 'lucide-react';
import { useTheme } from './ThemeProvider';

// 首页的日夜切换卡片（必须 export default，首页按默认导出引入）
export default function ThemeToggleBlock() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      data-glow
      onClick={(e) => {
        // 键盘触发（detail 为 0）时没有鼠标坐标，就从卡片中心展开
        if (e.detail === 0) {
          const rect = e.currentTarget.getBoundingClientRect();
          toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        } else {
          toggleTheme({ x: e.clientX, y: e.clientY });
        }
      }}
      aria-pressed={isDark}
      className="glass-card group relative flex h-full w-full cursor-pointer flex-col overflow-hidden p-5 text-left transition-all duration-500 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 sm:p-6"
    >
      <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
        <SunMoon className="h-4 w-4 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
        外观
      </span>

      <span className="flex flex-1 flex-col items-center justify-center pt-4 text-center">
        {/* 日夜交替动画图标 */}
        <span className="relative block h-16 w-16 flex-shrink-0 overflow-hidden rounded-full shadow-inner ring-1 ring-white/60 dark:ring-white/10" aria-hidden="true">
          <span className={`absolute inset-0 bg-gradient-to-tr from-sky-300 to-yellow-200 transition-transform duration-700 ${isDark ? '-translate-y-full' : 'translate-y-0'}`}></span>
          <span className={`absolute inset-0 bg-gradient-to-tr from-indigo-900 to-slate-800 transition-transform duration-700 ${isDark ? 'translate-y-0' : 'translate-y-full'}`}></span>

          <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl drop-shadow-md transition-all duration-700 ${isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}>
            🌸
          </span>
          <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl drop-shadow-md transition-all duration-700 ${isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`}>
            ✨
          </span>
        </span>

        <span className="mt-3 block text-base font-bold text-slate-800 transition-colors duration-500 dark:text-slate-100">
          {isDark ? '夜间模式' : '日间模式'}
        </span>
        <span className="mt-0.5 block text-xs font-medium text-slate-500 transition-colors duration-500 dark:text-slate-400">
          {isDark ? '流萤飞舞的深空' : '落樱漫舞的清晨'}
        </span>
      </span>
    </button>
  );
}
