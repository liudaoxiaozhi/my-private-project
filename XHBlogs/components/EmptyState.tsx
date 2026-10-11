// components/EmptyState.tsx —— 统一的空状态 / 没搜到：一张毛玻璃卡片，图标 + 标题 + 一句说明 + 可选按钮
//
// 设计约定：空状态一律用它，不要再让一行灰字直接浮在背景插画上（看不清，也显得像出错了）。
// 图标放在淡强调色的圆角方块里；标题 text-xl font-black；说明 text-sm text-slate-500。
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 可选的按钮 / 链接 */
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`glass-card mx-auto flex w-full max-w-lg flex-col items-center px-6 py-12 text-center sm:px-10 sm:py-16 ${className}`}>
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-400/10 dark:text-indigo-300">
        {icon}
      </div>
      <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
