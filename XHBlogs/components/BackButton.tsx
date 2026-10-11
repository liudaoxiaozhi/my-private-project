"use client";
// components/BackButton.tsx —— 「返回上一级」小按钮（毛玻璃胶囊）。compact：放在页头卡片里用，不带外边距
import { useRouter } from 'next/navigation';

export default function BackButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`glass-chip group inline-flex w-max cursor-pointer items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 transition-colors duration-300 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 ${compact ? '' : 'mb-8'}`}
    >
      <svg className="h-4 w-4 transform transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      返回上一级
    </button>
  );
}
