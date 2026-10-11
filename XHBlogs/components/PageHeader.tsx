// components/PageHeader.tsx —— 列表页统一的页头：一张毛玻璃卡片，标题、副标题、右侧操作、下方筛选
//
// 设计约定（各页面都按这个来，别再各写各的）：
// - 整张页头是 glass-card，标题和副标题不再直接压在背景插画上，任何背景下都看得清
// - 标题左对齐，粗体中文（text-3xl / sm:text-4xl font-black），可带一个强调色图标
// - 副标题一句话，正常字重、不用斜体：text-sm text-slate-600 dark:text-slate-300
// - actions：右上角的按钮 / 搜索框；children：标题下面的一整行（筛选标签、统计、搜索框等）
// - back：在卡片左上角放「返回」小按钮（不再单独浮在背景上）
// 外层的宽度和上边距由页面自己决定（一般 max-w-6xl mx-auto mt-24 sm:mt-28 px-4 sm:px-6）。
import type { ReactNode } from 'react';
import BackButton from './BackButton';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** 标题左边的图标（lucide 图标等），自动套上强调色 */
  icon?: ReactNode;
  /** 右上角：按钮、搜索框 */
  actions?: ReactNode;
  /** 标题下方的一整行：筛选标签、统计数字、搜索框 */
  children?: ReactNode;
  /** 左上角显示「返回上一级」 */
  back?: boolean;
  className?: string;
}

export default function PageHeader({ title, subtitle, icon, actions, children, back, className = '' }: PageHeaderProps) {
  return (
    <section className={`glass-card relative px-5 py-6 sm:px-8 sm:py-8 ${className}`}>
      {back && (
        <div className="mb-4">
          <BackButton compact />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            {icon && <span className="shrink-0 text-indigo-500 dark:text-indigo-400">{icon}</span>}
            <span className="min-w-0">{title}</span>
          </h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

/**
 * 页头里的筛选标签（全部 / 分类……）。选中：强调色实心；未选中：半透明白底。
 * 和追番、书架页现有的标签一个样子
 */
export function FilterChip({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
        active
          ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/25'
          : 'bg-white/60 text-slate-600 hover:bg-white/90 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/70'
      }`}
    >
      {children}
      {count !== undefined && <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>}
    </button>
  );
}
