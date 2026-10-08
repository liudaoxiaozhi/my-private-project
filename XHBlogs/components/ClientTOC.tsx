"use client";
// components/ClientTOC.tsx —— 文章目录
//
// 标题 id 在构建时生成（lib/md/rehype.ts），这里直接用，不再在浏览器里改正文。
// - ClientTOC：电脑端侧栏目录，跟随阅读位置高亮，长目录自动滚到当前项
// - MobileTOC：手机 / 平板上的悬浮目录按钮，点开从底部弹出

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ListTree, X } from 'lucide-react';
import type { TocItem } from '../lib/markdown';
import { useIsClient } from '../lib/useIsClient';

/** 标题滚到距视口顶部这么近时算「正在读」 */
const ACTIVE_OFFSET = 140;

function useActiveHeading(toc: TocItem[]): string {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const headings = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      let current = '';
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - ACTIVE_OFFSET > 0) break;
        current = heading.id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [toc]);

  return activeId;
}

function scrollToHeading(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  // 标题上有 scroll-margin-top，导航栏不会挡住标题
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
}

interface TocListProps {
  toc: TocItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}

function TocList({ toc, activeId, onNavigate }: TocListProps) {
  const minLevel = Math.min(...toc.map((item) => item.level));

  return (
    <nav aria-label="文章目录" className="relative flex flex-col gap-2">
      <div className="absolute bottom-0 left-0 top-0 w-[2px] rounded-full bg-slate-200 dark:bg-slate-700/50" />
      {toc.map((item) => {
        const isActive = activeId === item.id;
        const depth = item.level - minLevel;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            data-toc-id={item.id}
            aria-current={isActive ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(item.id);
            }}
            className={`relative line-clamp-2 pl-4 text-left text-sm transition-all duration-300
              ${depth === 0 ? 'mt-1 font-bold' : ''}
              ${depth === 1 ? 'ml-3' : ''}
              ${depth >= 2 ? 'ml-6 text-xs' : ''}
              ${isActive ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-indigo-500 dark:text-slate-400 dark:hover:text-indigo-400'}`}
          >
            {isActive && (
              <span className="absolute left-[-2px] top-1/2 h-[6px] w-[6px] -translate-y-1/2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
            )}
            {item.text}
          </a>
        );
      })}
    </nav>
  );
}

export default function ClientTOC({ toc }: { toc: TocItem[] }) {
  const activeId = useActiveHeading(toc);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // 目录很长时，让当前项保持在目录框可见范围内（只滚目录框，不滚页面）
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(activeId)}"]`);
    if (!scroller || !active) return;
    const top = active.offsetTop - scroller.clientHeight / 2;
    scroller.scrollTo({ top, behavior: 'smooth' });
  }, [activeId]);

  if (toc.length === 0) return null;

  return (
    <div
      ref={scrollerRef}
      className="glass-card custom-scrollbar max-h-[75vh] overflow-y-auto p-6 transition-colors duration-700"
    >
      <h3 className="mb-4 border-l-4 border-indigo-500 pl-2 text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">
        Table of Contents
      </h3>
      <TocList toc={toc} activeId={activeId} onNavigate={scrollToHeading} />
    </div>
  );
}

export function MobileTOC({ toc }: { toc: TocItem[] }) {
  const activeId = useActiveHeading(toc);
  const [open, setOpen] = useState(false);
  const mounted = useIsClient();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (toc.length === 0 || !mounted) return null;

  const activeText = toc.find((item) => item.id === activeId)?.text;

  return createPortal(
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开目录"
        className="glass-chip fixed bottom-[9.5rem] right-4 z-[90] flex h-11 w-11 items-center justify-center text-slate-700 transition-all active:scale-90 dark:text-slate-200 md:bottom-32 md:right-6"
      >
        <ListTree size={20} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="toc-backdrop"
              className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="toc-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="文章目录"
              className="glass-float fixed inset-x-0 bottom-0 z-[101] flex max-h-[72vh] flex-col rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            >
              <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
              <div className="flex items-center justify-between px-6 pb-2 pt-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black tracking-widest text-slate-900 dark:text-white">目录</h3>
                  {activeText && <p className="truncate text-xs text-slate-400">正在读：{activeText}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="关闭目录"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-500/10"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain px-6 pb-6 pt-2">
                <TocList
                  toc={toc}
                  activeId={activeId}
                  onNavigate={(id) => {
                    setOpen(false);
                    // 等底部弹层收起、页面恢复滚动后再跳
                    window.setTimeout(() => scrollToHeading(id), 50);
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
