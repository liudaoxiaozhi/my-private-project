"use client";

import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { siteConfig } from '../siteConfig';
import { useToast } from './ToastProvider';
import SocialLinks from './SocialLinks';
import AppImage from './AppImage';

/**
 * 首页名片：上面头像 + 名字 + 一句话简介，中间一排三个统计（随卡片高度伸展、内容居中，不留大块空白），底部社交按钮。
 * 整张卡点击去「关于」页。
 */
export default function ProfileCard({ postCount, chatterCount, photoCount }: { postCount: number, chatterCount: number, photoCount: number }) {
  const router = useRouter();
  const { showToast } = useToast();

  return (
    <div data-glow
      onClick={() => router.push('/about')}
      className="glass-card group relative flex h-full cursor-pointer flex-col gap-5 overflow-hidden p-5 transition-all duration-700 hover:scale-[1.01] sm:p-6 md:p-7"
    >
      {/* 头像 + 名字 + 简介 */}
      <div className="flex items-center gap-4 md:gap-5">
        <div className="h-16 w-16 flex-shrink-0 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-300 p-[3px] shadow-lg transition-transform duration-500 group-hover:rotate-3 sm:h-20 sm:w-20">
          <AppImage src={siteConfig.avatarUrl} alt={siteConfig.authorName} width={192} height={192} loading="eager" className="h-full w-full rounded-[13px] bg-white object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          {/* leading-snug + pb-0.5 给字母降部留空间 */}
          <h1 className="truncate pb-0.5 text-xl font-bold leading-snug tracking-wide text-slate-900 transition-colors duration-700 sm:text-2xl md:text-3xl dark:text-white">
            {siteConfig.authorName}
          </h1>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-500 transition-colors duration-700 dark:text-slate-400">
            {siteConfig.bio}
          </p>
        </div>
        <ArrowUpRight
          className="hidden h-5 w-5 flex-shrink-0 self-start text-slate-400 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-500 sm:block dark:text-slate-500 dark:group-hover:text-indigo-400"
          aria-hidden="true"
        />
      </div>

      {/* 统计：一排三格，细分隔线；flex-1 吃掉剩余高度，数字在其中垂直居中 */}
      <dl className="glass-panel grid flex-1 grid-cols-3 items-center divide-x divide-slate-200/80 rounded-2xl py-3 dark:divide-white/10">
        <StatItem count={postCount} label="文章" />
        <StatItem count={chatterCount} label="杂谈" />
        <StatItem count={photoCount} label="照片" />
      </dl>

      <SocialLinks
        size="md"
        className="justify-center sm:justify-start"
        onCopied={(label, value) => showToast(`✨ ${label}已复制到剪贴板: ${value}`, 'success')}
      />
    </div>
  );
}

function StatItem({ count, label }: { count: number, label: string }) {
  return (
    <div className="group/stat flex flex-col-reverse items-center gap-0.5 px-2 py-1">
      <dt className="lab-label text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-2xl font-black leading-none text-slate-900 tabular-nums transition-colors group-hover/stat:text-indigo-600 md:text-[1.75rem] dark:text-white dark:group-hover/stat:text-indigo-400">{count}</dd>
    </div>
  );
}
