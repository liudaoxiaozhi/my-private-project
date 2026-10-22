"use client";
// app/chatter/ChatterBoard.tsx —— 杂谈页主体：页头（搜索 + 标签筛选）+ 瀑布流卡片
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { NotebookPen, Search, SearchX } from 'lucide-react';
import { siteConfig } from '../../siteConfig';
import AppImage from '../../components/AppImage';
import PageHeader, { FilterChip } from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';

type Chatter = {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  mood?: string;
  cover?: string;
  content: string;
};

const ALL = "全部";

export default function ChatterBoard({ chatters }: { chatters: Chatter[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState(ALL);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    chatters.forEach(c => c.tags?.forEach(t => tags.add(t)));
    return [ALL, ...Array.from(tags)];
  }, [chatters]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL]: chatters.length };
    chatters.forEach(c => c.tags?.forEach(t => { counts[t] = (counts[t] ?? 0) + 1; }));
    return counts;
  }, [chatters]);

  const filteredChatters = useMemo(() => {
    if (searchQuery.length > 0 && searchQuery.trim() === "") return [];
    const query = searchQuery.trim().toLowerCase();

    return chatters.filter(chatter => {
      const matchSearch = chatter.title.toLowerCase().includes(query) ||
                          chatter.content.toLowerCase().includes(query);
      const matchTag = activeTag === ALL || chatter.tags?.includes(activeTag);
      return matchSearch && matchTag;
    });
  }, [chatters, searchQuery, activeTag]);

  const description = siteConfig.chatterDescription || "日常碎片与灵感记录";

  return (
    <div className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-4 pb-24 md:mt-28 sm:px-6">
      <PageHeader
        title={siteConfig.chatterTitle || "杂谈"}
        icon={<NotebookPen size={30} />}
        subtitle={chatters.length > 0 ? `${description}，共 ${chatters.length} 篇` : description}
      >
        {chatters.length > 0 && (
          <div className="flex flex-col gap-4">
            <label className="relative block w-full sm:max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="搜索标题或正文"
                aria-label="搜索杂谈"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full bg-white/70 py-2 pl-10 pr-4 text-sm text-slate-800 outline-none ring-1 ring-black/5 transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400 dark:bg-slate-800/60 dark:text-slate-100 dark:ring-white/10"
              />
            </label>
            {allTags.length > 1 && (
              <nav aria-label="标签" className="flex flex-wrap gap-2">
                {allTags.map(tag => (
                  <FilterChip key={tag} active={activeTag === tag} count={tagCounts[tag]} onClick={() => setActiveTag(tag)}>
                    {tag}
                  </FilterChip>
                ))}
              </nav>
            )}
          </div>
        )}
      </PageHeader>

      {/* 瀑布流：手机两列，大屏三列。每张卡片用 mb 隔开（space-y 会让第二列顶部错位） */}
      <motion.div layout className="mt-6 columns-2 gap-3 sm:gap-5 lg:columns-3">
        <AnimatePresence mode='popLayout'>
          {filteredChatters.map((chatter) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              key={chatter.slug}
              className="mb-3 break-inside-avoid sm:mb-5"
            >
              {/* 位移 / 阴影的过渡由 data-tilt 统一提供（globals.css），这里不再写 transition */}
              <Link data-glow data-tilt
                href={`/chatter/${chatter.slug}`}
                className="glass-card group relative block overflow-hidden hover:-translate-y-1 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {chatter.cover && (
                  <div className="relative h-28 w-full overflow-hidden sm:h-48">
                    <AppImage data-vt-cover src={chatter.cover} alt={chatter.title || '杂谈封面'} fill sizes="(min-width: 1024px) 400px, 50vw" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent"></div>
                    {chatter.mood && (
                      <span className="absolute right-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm sm:right-3 sm:top-3 sm:px-2.5 sm:text-xs">
                        {chatter.mood}
                      </span>
                    )}
                  </div>
                )}

                <div className="p-3.5 sm:p-6">
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400 sm:mb-2 sm:text-xs">
                    <span>{chatter.date}</span>
                    {/* 没有封面时，心情放在日期旁边 */}
                    {!chatter.cover && chatter.mood && (
                      <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 font-bold text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
                        {chatter.mood}
                      </span>
                    )}
                  </div>

                  {chatter.title && (
                    <h3 className="mb-1.5 line-clamp-2 text-[15px] font-bold leading-snug text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400 sm:mb-2 sm:text-lg">
                      {chatter.title}
                    </h3>
                  )}

                  <p className="line-clamp-4 break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:line-clamp-5 sm:text-sm">
                    {chatter.content}
                  </p>

                  {chatter.tags && chatter.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 sm:mt-4 sm:text-xs">
                      {chatter.tags.map(t => (
                        <span key={t}>#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {filteredChatters.length === 0 && (
        chatters.length === 0 ? (
          <EmptyState
            icon={<NotebookPen size={28} />}
            title="还没有杂谈"
            description="写下第一篇吧，日常碎片和一闪而过的念头都可以放在这里。"
          />
        ) : (
          <EmptyState
            icon={<SearchX size={28} />}
            title="没有找到相关的杂谈"
            description="换个关键词，或者切回「全部」标签试试。"
            action={
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setActiveTag(ALL); }}
                className="rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-black/5 transition-colors hover:text-indigo-600 dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10 dark:hover:text-indigo-400"
              >
                清除筛选
              </button>
            }
          />
        )
      )}
    </div>
  );
}
