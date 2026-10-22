"use client";
// components/TimelineClient.tsx —— 归档页主体：页头（搜索 + 标签筛选 + 视图切换）+ 时间线 / 卡片两种视图

import { useState, useMemo, useRef, useEffect, useSyncExternalStore } from 'react';
import TimelineNode from '@/components/TimelineNode';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Search, SearchX, LayoutGrid, ListTree, Calendar, ArrowUp, Inbox } from 'lucide-react';
import Link from 'next/link';
import AppImage from '@/components/AppImage';
import PageHeader, { FilterChip } from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import type { PostMeta, TagStat } from '@/lib/content';

interface TimelineClientProps {
  /** 已由服务端兜底：tags 至少含「未分类」，cover 已替换为默认封面 */
  posts: PostMeta[];
  tags: TagStat[];
}

const subscribeNone = () => () => {};
const readUrlTag = () => new URLSearchParams(window.location.search).get('tag');

// 手机端（< 768px）只用卡片视图。用订阅 matchMedia 代替「effect 里 setState」
const MOBILE_QUERY = '(max-width: 767px)';
const subscribeMobile = (onChange: () => void) => {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};
const readMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const readServerMobile = () => false;

export default function TimelineClient({ posts, tags }: TimelineClientProps) {
  // null = 读者还没点过标签，沿用地址栏里的 ?tag=
  const [chosenTag, setChosenTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [preferredView, setViewMode] = useState<'timeline' | 'card'>('timeline');
  const isMobile = useSyncExternalStore(subscribeMobile, readMobile, readServerMobile);
  const viewMode = isMobile ? 'card' : preferredView;
  const [showScrollTop, setShowScrollTop] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  // 支持 /timeline?tag=xxx（文章页的标签链接到这里），切换标签时同步到地址栏，方便分享
  const urlTag = useSyncExternalStore(subscribeNone, readUrlTag, () => null);
  const selectedTag = chosenTag ?? (urlTag && tags.some((t) => t.name === urlTag) ? urlTag : 'All');

  const setSelectedTag = (tag: string) => {
    setChosenTag(tag);
    const url = new URL(window.location.href);
    if (tag === 'All') url.searchParams.delete('tag');
    else url.searchParams.set('tag', tag);
    window.history.replaceState(window.history.state, '', url);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return posts.filter(post =>
      post.title.toLowerCase().includes(query) ||
      (post.description && post.description.toLowerCase().includes(query))
    );
  }, [posts, searchQuery]);

  const timelinePosts = useMemo(() => {
    return posts.filter(post => {
      return selectedTag === 'All' || post.tags?.includes(selectedTag);
    });
  }, [posts, selectedTag]);

  const handleGridScroll = () => {
    if (gridScrollRef.current) {
      setShowScrollTop(gridScrollRef.current.scrollTop > 200);
    }
  };

  const scrollToTop = () => {
    if (gridScrollRef.current) {
      try {
        gridScrollRef.current.scroll({ top: 0, left: 0, behavior: 'smooth' });
      } catch {
        gridScrollRef.current.scrollTo(0, 0);
      }
    }
  };

  // 视图切换的选中态刻意不用 bg-indigo-500：e2e 用「第一个 button.bg-indigo-500」找选中的标签
  const viewButton = (mode: 'timeline' | 'card') =>
    `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
      viewMode === mode
        ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-4 md:mt-28 sm:px-6">
      <PageHeader
        // z-30：让搜索下拉盖住下面的卡片（卡片各自有 backdrop-blur / transform 层叠上下文）
        className="z-30"
        title="归档"
        icon={<Archive size={30} />}
        subtitle={posts.length > 0 ? `共 ${posts.length} 篇文章，按时间排列，可以按标签筛选` : '还没有发布文章'}
        actions={
          <div role="group" aria-label="视图" className="hidden rounded-full bg-white/70 p-1 ring-1 ring-black/5 dark:bg-slate-800/60 dark:ring-white/10 md:inline-flex">
            <button type="button" onClick={() => setViewMode('timeline')} aria-pressed={viewMode === 'timeline'} className={viewButton('timeline')}>
              <ListTree size={15} aria-hidden="true" /> 时间线
            </button>
            <button type="button" onClick={() => setViewMode('card')} aria-pressed={viewMode === 'card'} className={viewButton('card')}>
              <LayoutGrid size={15} aria-hidden="true" /> 卡片
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="relative w-full sm:max-w-md" ref={searchContainerRef}>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              placeholder="搜索文章标题或摘要"
              aria-label="搜索文章"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              className="w-full rounded-full bg-white/70 py-2 pl-10 pr-4 text-sm text-slate-800 outline-none ring-1 ring-black/5 transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400 dark:bg-slate-800/60 dark:text-slate-100 dark:ring-white/10"
            />

            <AnimatePresence>
              {isDropdownOpen && searchQuery.trim() !== '' && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="glass-float absolute left-0 right-0 top-full z-[100] mt-2 max-h-[360px] overflow-hidden overflow-y-auto rounded-2xl"
                >
                  {searchResults.length > 0 ? (
                    <div className="flex flex-col py-1.5">
                      {searchResults.map((post) => (
                        <Link
                          href={`/posts/${post.slug}`}
                          key={post.slug}
                          onClick={() => setIsDropdownOpen(false)}
                          className="group flex flex-col gap-1 border-b border-slate-200/50 px-4 py-3 transition-colors last:border-0 hover:bg-indigo-500/5 dark:border-slate-700/50 dark:hover:bg-indigo-400/10"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="line-clamp-1 text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                              {post.title}
                            </h4>
                            <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {post.date.split(' ')[0]}
                            </span>
                          </div>
                          {post.description && (
                            <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{post.description}</p>
                          )}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                      <SearchX size={16} aria-hidden="true" /> 没有找到相关文章
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {tags.length > 0 && (
            <nav aria-label="标签" className="flex flex-wrap gap-2">
              <FilterChip active={selectedTag === 'All'} count={posts.length} onClick={() => setSelectedTag('All')}>
                全部
              </FilterChip>
              {tags.map(tag => (
                <FilterChip key={tag.name} active={selectedTag === tag.name} count={tag.count} onClick={() => setSelectedTag(tag.name)}>
                  {tag.name}
                </FilterChip>
              ))}
            </nav>
          )}
        </div>
      </PageHeader>

      {timelinePosts.length === 0 ? (
        <div className="mt-6">
          {posts.length === 0 ? (
            <EmptyState icon={<Inbox size={28} />} title="还没有文章" description="发布的文章会按时间出现在这里。" />
          ) : (
            <EmptyState
              icon={<Inbox size={28} />}
              title="这个标签下还没有文章"
              description="换一个标签，或者回到全部文章看看。"
              action={
                <button
                  type="button"
                  onClick={() => setSelectedTag('All')}
                  className="rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-black/5 transition-colors hover:text-indigo-600 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10 dark:hover:text-indigo-400"
                >
                  查看全部文章
                </button>
              }
            />
          )}
        </div>
      ) : (
        <AnimatePresence mode="wait">

          {/* ================= 卡片视图（手机端固定用它） ================= */}
          {viewMode === 'card' && (
            <motion.div
              key="card-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="relative mt-6 w-full"
            >
              <style dangerouslySetInnerHTML={{ __html: `
                .archive-scrollbar::-webkit-scrollbar { width: 8px; }
                .archive-scrollbar::-webkit-scrollbar-track { background: transparent; margin-top: 20px; margin-bottom: 56px; }
                .archive-scrollbar::-webkit-scrollbar-thumb { background: color-mix(in oklab, var(--color-indigo-400) 60%, transparent); border-radius: 9999px; }
                .fade-edges { -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 3%, black 95%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0%, black 3%, black 95%, transparent 100%); }
              `}} />

              <div
                ref={gridScrollRef}
                onScroll={handleGridScroll}
                className="archive-scrollbar fade-edges h-[75vh] overflow-y-auto pb-10 pr-1 sm:pr-3"
              >
                <div className="grid grid-cols-2 gap-3 pb-10 pt-3 sm:gap-5 lg:grid-cols-3">
                  {timelinePosts.map((post, idx) => (
                    <motion.div key={post.slug} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: Math.min(idx, 12) * 0.04 }}>
                      {/* 位移 / 阴影的过渡由 data-tilt 统一提供（globals.css），这里不再写 transition */}
                      <div data-glow data-tilt className="glass-card group relative flex h-full flex-col overflow-hidden hover:-translate-y-1 hover:shadow-2xl">
                        <Link href={`/posts/${post.slug}`} className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400">
                          <div className="relative h-28 overflow-hidden sm:h-40">
                            <AppImage data-vt-cover src={post.cover} alt={post.title} fill sizes="(min-width: 768px) 360px, 50vw" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          </div>

                          <div className="flex flex-1 flex-col p-3.5 sm:p-5">
                            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400 sm:text-xs">
                              <Calendar size={12} aria-hidden="true" /> {post.date.split(' ')[0]}
                            </p>
                            <h3 className="mb-1.5 line-clamp-2 text-[15px] font-bold leading-snug text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400 sm:text-lg">{post.title}</h3>
                            <p className="mb-3 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">{post.description || "暂时没有描述喵..."}</p>
                            <div className="mt-auto flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 sm:text-xs">
                              {post.tags.map((tag: string) => (
                                <span key={tag}>#{tag}</span>
                              ))}
                            </div>
                          </div>
                        </Link>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* 回到顶部（卡片视图在框内滚动） */}
              <AnimatePresence>
                {showScrollTop && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.5, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 10 }}
                    onClick={scrollToTop}
                    className="absolute bottom-4 right-0 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition-colors hover:bg-indigo-600 sm:-right-3"
                    title="回到顶部"
                    aria-label="回到顶部"
                  >
                    <ArrowUp size={18} />
                  </motion.button>
                )}
              </AnimatePresence>

            </motion.div>
          )}

          {/* ================= 时间线视图 ================= */}
          {viewMode === 'timeline' && (
            <motion.div
              key="timeline-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="relative mt-6 min-h-[500px] overflow-hidden p-2 md:p-10"
            >
              <div className="absolute left-1/2 h-full -translate-x-1/2 rounded-full border-2 border-indigo-500/20 dark:border-indigo-400/20"></div>

              <div className="relative z-10 flex flex-col gap-16">
                <AnimatePresence mode='popLayout'>
                  {timelinePosts.map((post, index) => (
                    <TimelineNode
                      key={post.slug}
                      post={post}
                      index={index + 1}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      )}
    </div>
  );
}
