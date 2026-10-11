// components/MobileBackButton.tsx —— 手机端悬浮的「返回上一页」：和 BackButton 同款毛玻璃胶囊，固定位置放不下文字，做成圆形图标
"use client";

import { usePathname, useRouter } from 'next/navigation';

export default function MobileBackButton() {
  const router = useRouter();
  // 首页没有「上一页」可回
  if (usePathname() === '/') return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      // 放在右下角稍微靠上的位置，避开底部的浮层；尺寸与右边缘的导航把手（40px 点按区）一致
      className="glass-chip group fixed bottom-24 right-4 z-[90] flex h-10 w-10 items-center justify-center ring-1 ring-black/5 text-slate-600 transition-[color,scale] duration-200 hover:text-indigo-600 active:scale-90 dark:ring-white/10 dark:text-slate-300 dark:hover:text-indigo-400"
      aria-label="返回上一页"
      title="返回上一页"
    >
      <svg className="h-[18px] w-[18px] transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
    </button>
  );
}
