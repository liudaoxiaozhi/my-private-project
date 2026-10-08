"use client";
// components/novel/ContinueReading.tsx —— 书页上的「开始阅读 / 继续阅读」按钮
//
// 服务端渲染时一律显示「开始阅读」；挂载后读取本地进度，章节仍存在时换成「继续阅读」，避免 Hydration 不一致。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, History } from 'lucide-react';
import { loadProgress } from '../../lib/novelProgress';
import type { NovelProgress } from '../../lib/novelProgress';

interface ContinueReadingProps {
  bookSlug: string;
  firstHref: string;
  /** 当前仍存在的章节网址；本地进度指向已删除的章节时不显示「继续阅读」 */
  validHrefs: string[];
}

const PRIMARY =
  'inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2';
const SECONDARY =
  'glass-chip inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-slate-700 transition-all duration-300 ease-out hover:bg-white/80 dark:text-slate-200 dark:hover:bg-slate-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export default function ContinueReading({ bookSlug, firstHref, validHrefs }: ContinueReadingProps) {
  const [progress, setProgress] = useState<NovelProgress | null>(null);

  useEffect(() => {
    const saved = loadProgress(bookSlug);
    if (saved && validHrefs.includes(saved.href)) setProgress(saved);
  }, [bookSlug, validHrefs]);

  if (!progress) {
    return (
      <Link href={firstHref} className={PRIMARY}>
        <BookOpen size={16} /> 开始阅读
      </Link>
    );
  }

  return (
    <>
      <Link href={progress.href} className={PRIMARY}>
        <History size={16} />
        <span className="max-w-[16rem] truncate">继续阅读 · {progress.title}</span>
      </Link>
      {progress.href !== firstHref && (
        <Link href={firstHref} className={SECONDARY}>
          <BookOpen size={16} /> 从头读
        </Link>
      )}
    </>
  );
}
