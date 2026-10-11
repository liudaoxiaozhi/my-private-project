"use client";

import { useState, useSyncExternalStore } from 'react';
import { motion, type Variants } from 'framer-motion';
import { ArrowDown, Check, Copy, Link2, MessageSquare, Users } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { friendsData } from '../../data/friends';
import Comments from '../../components/Comments'; // 🌟 引入你的 Gitalk 组件
import { siteConfig } from '../../siteConfig'; // 🌟 引入刚刚更新的全局配置文件
import { fillFriendLinkTemplate } from '../../lib/friendLink';
import AppImage from '../../components/AppImage';

// Framer Motion 动画变体：交错子元素
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 } // 每张卡片延迟 0.15 秒出现
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

// 当前网址在页面生命周期内不会变，订阅函数什么也不用做
const subscribeNoop = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => '';

/** 卡片上显示的域名；网址写得不规范时退回原文 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function FriendsBoard() {
  // 🌟 控制复制按钮的状态
  const [isCopied, setIsCopied] = useState(false);

  // 🌟 直接从 siteConfig 读取申请格式
  // 模板里的 {{siteUrl}} 等占位符：服务端渲染和水合首帧用占位文字，之后填入当前网址，避免两边渲染不一致
  const origin = useSyncExternalStore(subscribeNoop, getOrigin, getServerOrigin);
  const applyFormat = fillFriendLinkTemplate(siteConfig.friendLinkApplyFormat, origin);

  const handleCopy = () => {
    navigator.clipboard.writeText(applyFormat);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="relative z-10 scroll-smooth">

      <PageHeader
        back
        icon={<Users size={30} />}
        title="云端引力"
        subtitle={
          friendsData.length > 0
            ? `那些散落在赛博宇宙各处的有趣灵魂与神经节点，共 ${friendsData.length} 位。`
            : '那些散落在赛博宇宙各处的有趣灵魂与神经节点。'
        }
      />

      {friendsData.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Users size={30} />}
          title="还没有友链"
          description="欢迎按下方的格式在留言区申请，成为这里的第一位朋友。"
        />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
        >
          {friendsData.map((friend) => (
            <motion.div key={friend.id} variants={itemVariants} className="h-full">
              <a data-glow data-tilt
                href={friend.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card group relative block h-full overflow-hidden p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:p-6"
              >
                {/* 卡片底部的动态光晕（颜色来自每个友链自己的主题色） */}
                <div
                  className="pointer-events-none absolute -bottom-10 -right-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
                  style={{ backgroundColor: friend.themeColor }}
                ></div>

                <div className="relative z-10 flex items-center gap-4">
                  <div className="h-14 w-14 shrink-0 rounded-full bg-indigo-500/15 p-[3px] ring-1 ring-indigo-500/20 dark:bg-indigo-400/15 dark:ring-indigo-400/20 sm:h-16 sm:w-16">
                    <AppImage src={friend.avatar} alt={friend.name} width={128} height={128} className="h-full w-full rounded-full bg-white object-cover" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-black tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                      {friend.name}
                    </h2>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                      {hostOf(friend.url)}
                    </p>
                  </div>
                </div>

                <p className="relative z-10 mt-4 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {friend.description}
                </p>
              </a>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* 申请友链引导区 */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="glass-card relative mx-auto mt-10 max-w-3xl p-5 text-center sm:mt-14 sm:p-8"
      >
        <h2 className="flex items-center justify-center gap-2 text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          <Link2 size={22} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
          建立神经连接
        </h2>
        <p className="mx-auto mt-2 mb-5 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:mb-6">
          欢迎各位大佬交换友链！请一键复制下方格式，并在底部的 Gitalk 留言板申请：
        </p>

        {/* 代码展示框 & 一键复制按钮 */}
        <div className="relative inline-block w-full max-w-md overflow-hidden rounded-2xl bg-white/60 p-4 text-left ring-1 ring-black/5 dark:bg-slate-900/50 dark:ring-white/10 sm:p-5">
          <pre className="whitespace-pre-wrap break-all pr-9 font-mono text-xs text-slate-700 dark:text-slate-300 sm:pr-10 sm:text-sm">
            {applyFormat}
          </pre>

          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-2 top-2 rounded-lg bg-white/80 p-2 text-slate-500 shadow-sm transition-colors duration-300 hover:bg-indigo-500 hover:text-white dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-indigo-500 dark:hover:text-white sm:right-3 sm:top-3"
            title="一键复制"
            aria-label={isCopied ? '已复制' : '一键复制'}
          >
            {isCopied ? (
              <Check size={16} strokeWidth={2.5} className="text-emerald-500" />
            ) : (
              <Copy size={16} />
            )}
          </button>
        </div>

        <div className="mt-6 sm:mt-8">
          <a
            href="#gitalk-container"
            className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 sm:px-8 sm:py-3 sm:text-base"
          >
            前往留言区申请
            <ArrowDown size={16} strokeWidth={2.5} aria-hidden="true" />
          </a>
        </div>
      </motion.div>

      {/* Gitalk 评论区：放进毛玻璃卡片，标题不再直接压在背景上；抵消 Comments 自带的上边距 */}
      <motion.section
        id="gitalk-container"
        className="glass-card mt-10 scroll-mt-24 p-5 sm:mt-14 sm:p-8 [&>div]:mt-5"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-900 dark:text-white">
          <MessageSquare size={20} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
          终端留言板
        </h2>

        {/* 渲染评论组件 */}
        <Comments />
      </motion.section>

    </div>
  );
}
