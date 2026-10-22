"use client";

import { useState, useMemo, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { MapPin, Clock, Camera, Search, SearchX, ArrowDownAZ, ArrowUpZA, ChevronLeft, ChevronRight, Ghost } from 'lucide-react';
import AppImage from '../../components/AppImage';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import type { Moment } from '../../lib/content';

interface MomentListProps {
  moments: Moment[];
  authorName: string;
  avatarUrl: string;
}

/** 绝对日期，纯字符串处理：服务端与客户端首帧一致 */
function absoluteDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dateStr);
  return m ? `${m[1]}.${m[2].padStart(2, '0')}.${m[3].padStart(2, '0')}` : dateStr;
}

/**
 * 相对时间。now 为 null（服务端渲染 / 首帧水合）时返回绝对日期，
 * 挂载后再切换成「x 分钟前」，避免服务端与浏览器时间不同导致 Hydration 不匹配。
 */
function timeAgo(dateStr: string, now: number | null): string {
  if (now === null) return absoluteDate(dateStr);
  const time = new Date(dateStr.replace(' ', 'T')).getTime();
  if (Number.isNaN(time)) return dateStr;
  const diffInSeconds = Math.floor((now - time) / 1000);
  if (diffInSeconds < 60) return '刚刚';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} 分钟前`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} 小时前`;
  return absoluteDate(dateStr);
}

const subscribeMinute = (onTick: () => void) => {
  const timer = window.setInterval(onTick, 60_000);
  return () => window.clearInterval(timer);
};
/** 取整到分钟：同一分钟内多次读取返回同一个值，useSyncExternalStore 才不会反复重渲染 */
const readMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const readServerNow = () => null;

/** 服务端渲染与水合首帧为 null，挂载后才有值，每分钟刷新一次 */
function useNow(): number | null {
  return useSyncExternalStore(subscribeMinute, readMinute, readServerNow);
}

export default function MomentList({ moments, authorName, avatarUrl }: MomentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [lightbox, setLightbox] = useState<{ images: string[], index: number } | null>(null);
  const now = useNow();

  const processedMoments = useMemo(() => {
    let result = moments ? [...moments] : [];

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(m =>
        (m.content || '').toLowerCase().includes(query) ||
        (m.location || '').toLowerCase().includes(query)
      );
    }

    result.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    return result;
  }, [moments, searchQuery, sortOrder]);

  const nextImg = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!lightbox) return;
    setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.images.length });
  };

  const prevImg = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!lightbox) return;
    setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.images.length) % lightbox.images.length });
  };

  const renderImages = (images: string[]) => {
    if (!images || images.length === 0) return null;
    const count = images.length;

    if (count === 1) {
      return (
        <div className="mt-4 md:mt-8 flex justify-start sm:justify-center w-full">
          <div onClick={() => setLightbox({ images, index: 0 })} className="max-w-[80%] sm:max-w-[280px] overflow-hidden rounded-xl md:rounded-2xl border border-slate-200/50 dark:border-white/10 shadow-lg md:shadow-xl cursor-zoom-in group">
            <AppImage src={images[0]} alt="说说配图" width={560} height={420} sizes="(min-width: 640px) 280px, 80vw" className="w-full h-auto max-h-[300px] md:max-h-[400px] object-contain group-hover:scale-105 transition-transform duration-500" />
          </div>
        </div>
      );
    }

    const columns = count === 4 ? 2 : 3;
    const maxWidth = count === 4 ? '210px' : '320px';

    return (
      <div className="w-full flex justify-start sm:justify-center mt-4 md:mt-8">
        <div className="grid gap-1.5 md:gap-2 sm:mx-auto" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, width: '100%', maxWidth: maxWidth }}>
          {images.slice(0, 9).map((src, idx) => {
            const isLastVisible = idx === 8 && count > 9;
            return (
              <div key={idx} onClick={() => setLightbox({ images, index: idx })} className="group relative aspect-square overflow-hidden rounded-lg md:rounded-xl bg-slate-200/20 dark:bg-slate-700/20 border border-slate-200/50 dark:border-white/10 cursor-zoom-in">
                <AppImage src={src} alt="说说配图" fill sizes="(min-width: 768px) 200px, 33vw" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                {isLastVisible && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white backdrop-blur-[2px]">
                    <span className="text-lg md:text-xl font-black">+{count - 9}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMomentCard = (moment: Moment) => (
    <motion.div
      key={moment.id}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 100 }}
      className="glass-card group relative flex w-full flex-col overflow-hidden p-5 transition-shadow hover:shadow-2xl sm:p-7"
    >
      <div className="mb-4 flex items-center gap-3 border-b border-slate-200/60 pb-4 dark:border-slate-700/50 sm:mb-5 sm:pb-5">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl border-2 border-white shadow-sm dark:border-slate-700 sm:h-12 sm:w-12">
          <AppImage src={avatarUrl} alt={authorName} width={112} height={112} className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-base font-bold text-slate-900 dark:text-white">{authorName}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            <Clock size={12} aria-hidden="true" /> {timeAgo(moment.date, now)}
          </div>
        </div>
      </div>

      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 sm:text-base">{moment.content}</p>

      {renderImages(moment.images)}

      <div className="mt-5 flex items-center justify-between gap-3 sm:mt-6">
        <div className="min-w-0 flex-1">
          {moment.location && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
              <MapPin size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{moment.location}</span>
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );

  const total = moments?.length ?? 0;
  const searching = searchQuery.trim() !== '';
  const sortButton = (order: 'desc' | 'asc') =>
    `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
      sortOrder === order
        ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/25'
        : 'text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400'
    }`;

  return (
    <div className="relative z-10 mx-auto mt-8 flex w-full max-w-6xl flex-1 flex-col px-4 pb-24 md:mt-28 sm:px-6">
      <PageHeader
        title="生活动态"
        icon={<Camera size={30} />}
        subtitle={total > 0 ? `在代码之外捕捉瞬间的温度，共 ${total} 条` : '在代码之外捕捉瞬间的温度'}
      >
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block min-w-0 flex-1 basis-56 sm:max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="搜索内容或地点"
                aria-label="搜索说说"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full bg-white/70 py-2 pl-10 pr-4 text-sm text-slate-800 outline-none ring-1 ring-black/5 transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400 dark:bg-slate-800/60 dark:text-slate-100 dark:ring-white/10"
              />
            </label>
            <div role="group" aria-label="排序" className="inline-flex rounded-full bg-white/70 p-1 ring-1 ring-black/5 dark:bg-slate-800/60 dark:ring-white/10">
              <button type="button" onClick={() => setSortOrder('desc')} aria-pressed={sortOrder === 'desc'} className={sortButton('desc')}>
                <ArrowDownAZ size={14} aria-hidden="true" /> 最新
              </button>
              <button type="button" onClick={() => setSortOrder('asc')} aria-pressed={sortOrder === 'asc'} className={sortButton('asc')}>
                <ArrowUpZA size={14} aria-hidden="true" /> 最早
              </button>
            </div>
          </div>
        )}
      </PageHeader>

      <LayoutGroup>
        {processedMoments.length > 0 ? (
          <div className="mt-6 flex w-full flex-col items-start gap-5 md:flex-row md:gap-6">
            <div className="flex w-full min-w-0 flex-1 flex-col gap-5 md:gap-6">
              <AnimatePresence mode='popLayout'>
                {processedMoments.filter((_, i) => i % 2 === 0).map(moment => renderMomentCard(moment))}
              </AnimatePresence>
            </div>
            <div className="flex w-full min-w-0 flex-1 flex-col gap-5 md:gap-6">
              <AnimatePresence mode='popLayout'>
                {processedMoments.filter((_, i) => i % 2 === 1).map(moment => renderMomentCard(moment))}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mt-6">
            {searching ? (
              <EmptyState
                icon={<SearchX size={28} />}
                title="没找到相关记忆"
                description="试试精简搜索词，或者换个关键词再找找。"
                action={
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-black/5 transition-colors hover:text-indigo-600 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10 dark:hover:text-indigo-400"
                  >
                    清空搜索
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={<Ghost size={28} />}
                title="朋友圈空空如也"
                description="还没有记录下任何生活碎片呢。"
              />
            )}
          </motion.div>
        )}
      </LayoutGroup>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-950/98 backdrop-blur-xl flex items-center justify-center cursor-pointer overflow-hidden"
            onClick={() => setLightbox(null)}
          >
            {lightbox.images.length > 1 && (
              <>
                <button className="absolute left-4 md:left-12 w-10 h-10 md:w-14 md:h-14 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-50 border border-white/5 backdrop-blur-md" onClick={prevImg}><ChevronLeft size={24} className="md:w-9 md:h-9"/></button>
                <button className="absolute right-4 md:right-12 w-10 h-10 md:w-14 md:h-14 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-50 border border-white/5 backdrop-blur-md" onClick={nextImg}><ChevronRight size={24} className="md:w-9 md:h-9"/></button>
              </>
            )}
            <motion.div key={lightbox.index} initial={{ opacity: 0, scale: 0.9, x: 50 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9, x: -50 }} className="relative w-full h-full flex flex-col items-center justify-center p-4 md:p-12 pointer-events-none">
              {/* 灯箱展示原图，刻意保留原生 <img>，不经过尺寸压缩 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightbox.images[lightbox.index]} className="max-w-full max-h-[75vh] md:max-h-[85vh] object-contain rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-white/10 pointer-events-auto" alt="fullscreen" />
              <div className="absolute bottom-8 md:bottom-10 px-4 md:px-5 py-1.5 md:py-2 rounded-full bg-white/10 backdrop-blur-md text-white/90 text-[10px] md:text-xs font-black tracking-widest border border-white/10">
                {lightbox.index + 1} / {lightbox.images.length}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}