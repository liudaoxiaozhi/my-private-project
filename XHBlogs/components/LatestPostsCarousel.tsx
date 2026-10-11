// components/LatestPostsCarousel.tsx
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Newspaper } from 'lucide-react';
import AppImage from './AppImage';
import type { CardItem } from '../lib/content';

export default function LatestPostsCarousel({ posts }: { posts: CardItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // 设置自动播放定时器
  useEffect(() => {
    if (posts.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % posts.length);
    }, 5000); // 5秒切换一次
    return () => clearInterval(timer);
  }, [posts.length]);

  if (!posts || posts.length === 0) return null;

  const currentPost = posts[currentIndex];

  return (
    <div data-glow data-vt-card className="glass-card group relative flex h-full min-h-[340px] flex-col overflow-hidden lg:min-h-[420px]">

      {/* 整个卡片的点击跳转区域 */}
      <Link href={currentPost.slug === 'none' ? '#' : `/posts/${currentPost.slug}`} className="absolute inset-0 z-20" aria-label={`阅读 ${currentPost.title}`} />

      {/* 带有渐变交叉淡入淡出的图片背景 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPost.slug}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 z-0"
        >
          <AppImage data-vt-cover src={currentPost.cover} fill sizes="(min-width: 1024px) 400px, 100vw" className="h-full w-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105" alt={currentPost.title} />
          {/* 上下两道暗角：顶部压住卡片标题，底部压住文章标题和摘要 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40"></div>
        </motion.div>
      </AnimatePresence>

      {/* 文本内容区 */}
      <div className="pointer-events-none relative z-10 flex h-full flex-1 flex-col p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white drop-shadow-sm">
          <Newspaper className="h-4 w-4 text-indigo-300" aria-hidden="true" />
          最新文章
        </h2>

        <div className="mt-auto pt-6">
          {currentPost.formattedDate && (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/75 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {currentPost.formattedDate}
            </p>
          )}
          <h3 className="mb-2 line-clamp-2 text-xl font-bold text-white drop-shadow-md transition-transform group-hover:-translate-y-0.5 sm:text-2xl">{currentPost.title}</h3>
          <p className="line-clamp-3 text-sm text-white/75 drop-shadow-sm">{currentPost.description}</p>
        </div>
      </div>

      {/* 导航小圆点：和卡片标题同一行，放在可点击的 Link 层之上 */}
      {posts.length > 1 && (
        <div className="absolute right-5 top-5 z-30 flex h-5 items-center gap-1.5 sm:right-6 sm:top-6">
          {posts.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation(); // 阻止触发父级的外层跳转
                setCurrentIndex(i);
              }}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === currentIndex ? 'w-5 bg-indigo-400' : 'w-1.5 bg-white/50 hover:bg-white/90'}`}
              aria-label={`切换到第 ${i + 1} 篇文章`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
