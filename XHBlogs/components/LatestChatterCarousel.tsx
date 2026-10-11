// components/LatestChatterCarousel.tsx
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, MessageCircle } from 'lucide-react';
import AppImage from './AppImage';
import type { CardItem } from '../lib/content';

export default function LatestChatterCarousel({ chatters }: { chatters: CardItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (chatters.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % chatters.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [chatters.length]);

  if (!chatters || chatters.length === 0) return null;

  const currentChatter = chatters[currentIndex];

  const holoVariants = {
    initial: { opacity: 0, scale: 0.95, filter: "blur(10px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 1.05, filter: "blur(10px)" },
  };

  return (
    // 纯粹填满父容器的组件，宽高由首页网格决定
    <div data-glow data-vt-card className="glass-card group relative flex h-full min-h-[200px] w-full flex-col overflow-hidden">
      <Link href={currentChatter.slug === 'none' ? '/chatter' : `/chatter/${currentChatter.slug}`} className="absolute inset-0 z-20" aria-label={`查看杂谈: ${currentChatter.title}`} />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentChatter.slug}
          variants={holoVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0 z-0"
        >
          <AppImage data-vt-cover src={currentChatter.cover} fill sizes="(min-width: 1024px) 520px, 100vw" className="h-full w-full object-cover opacity-80 transition-transform duration-1000 group-hover:scale-105 dark:opacity-60" alt="Chatter Cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15"></div>
        </motion.div>
      </AnimatePresence>

      <div className="pointer-events-none relative z-10 flex h-full flex-1 flex-col p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white drop-shadow-sm">
          <MessageCircle className="h-4 w-4 text-indigo-300" aria-hidden="true" />
          最新杂谈
        </h2>

        <div className="mt-auto w-full pt-5 md:w-[85%]">
          {currentChatter.formattedDate && (
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-white/75 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {currentChatter.formattedDate}
            </p>
          )}
          <h3 className="mb-2 line-clamp-1 text-xl font-bold text-white drop-shadow-md transition-colors group-hover:text-indigo-200 sm:text-2xl">
            {currentChatter.title}
          </h3>
          <p className="line-clamp-2 text-sm font-medium leading-relaxed text-white/75 drop-shadow-md">
            {currentChatter.description}
          </p>
        </div>
      </div>

      {/* 导航小圆点：和卡片标题同一行，放在可点击的 Link 层之上 */}
      {chatters.length > 1 && (
        <div className="absolute right-5 top-5 z-30 flex h-5 items-center gap-1.5 sm:right-6 sm:top-6">
          {chatters.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === currentIndex ? 'w-5 bg-indigo-400' : 'w-1.5 bg-white/50 hover:bg-white/90'}`}
              aria-label={`切换到第 ${i + 1} 条杂谈`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
