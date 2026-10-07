// components/novel/novelStyles.ts —— 书架 / 书页共用的样式常量
import type { NovelStatus } from '../../lib/novel';

/** 毛玻璃卡片 */
export const GLASS =
  'rounded-3xl border border-white/40 bg-white/55 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/55';

export const STATUS_STYLE: Record<NovelStatus, string> = {
  连载中: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
  已完结: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300',
  暂停更新: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300',
};
