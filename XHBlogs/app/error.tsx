"use client";
// app/error.tsx —— 页面运行出错时的兜底界面（导航栏、背景等根布局部分仍然正常显示）

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RotateCcw } from 'lucide-react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative min-h-screen pb-24">
      <main className="relative z-10 mx-auto mt-32 w-full max-w-xl px-4 sm:px-6 md:mt-36">
        <section className="rounded-3xl border border-white/40 bg-white/60 px-6 py-12 text-center shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/60 sm:px-10">
          <p className="text-5xl" aria-hidden="true">🛠️</p>
          <h1 className="mt-4 text-2xl font-black text-slate-900 dark:text-white">出了点小状况</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            这一页加载时出错了。可以先重试一次，还不行的话回首页逛逛。
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-indigo-600"
            >
              <RotateCcw size={16} /> 重试
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-white/70 px-6 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-white/60 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white dark:bg-slate-900/50 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-900/70"
            >
              <Home size={16} /> 回到首页
            </Link>
          </div>

          {error.digest && (
            <p className="mt-8 text-[11px] text-slate-400">错误编号：<code className="select-all">{error.digest}</code></p>
          )}
        </section>
      </main>
    </div>
  );
}
