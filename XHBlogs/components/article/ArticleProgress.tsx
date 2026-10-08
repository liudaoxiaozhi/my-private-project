"use client";
// components/article/ArticleProgress.tsx —— 顶部阅读进度条 + 记住阅读位置
//
// - 进度按正文容器计算（不含评论区），直接改 transform，滚动时不触发 React 重渲染
// - 读到一半离开，下次打开同一篇时提示「继续上次阅读」；读完（≥95%）自动清除记录
// - 渲染到 body：换页入场动画期间外层容器带 transform，fixed 元素放在里面会跟着偏移

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, X } from 'lucide-react';
import { ARTICLE_CONTENT_ID, clearPosition, loadPosition, savePosition } from '../../lib/articleReader';
import { useIsClient } from '../../lib/useIsClient';
import { petalBurst, sendPetCommand } from '../../lib/petBus';

const SAVE_INTERVAL = 1000;
const MIN_RESUME = 0.08;
const FINISHED = 0.95;
const PROMPT_TIMEOUT = 12000;
/** 读者自己往下滚了这么多，就不再打扰 */
const DISMISS_SCROLL = 400;
/** 读完庆祝：要真的往下读过一段（直接跳到结尾、恢复阅读位置不算） */
const CELEBRATE_SCROLL = 600;
const FINISH_LINES = ['读完啦！辛苦了，Master。', '一口气读完了呢。要不要休息一下？', '读完了。……写得真好。'];

function readingRatio(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const scrollable = rect.height - window.innerHeight;
  if (scrollable <= 0) return rect.top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -rect.top / scrollable));
}

export default function ArticleProgress({ storageKey }: { storageKey: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [resumeRatio, setResumeRatio] = useState<number | null>(null);
  const mounted = useIsClient();

  useEffect(() => {
    const el = document.getElementById(ARTICLE_CONTENT_ID);
    if (!el || !mounted) return;

    // 等一帧再判断：刷新页面时浏览器会先恢复滚动位置。
    // 带 #小节 打开、或已经不在页面顶部时不提示
    const saved = loadPosition(storageKey);
    const promptFrame = requestAnimationFrame(() => {
      if (saved && saved.ratio >= MIN_RESUME && saved.ratio < FINISHED && !window.location.hash && window.scrollY < 200) {
        setResumeRatio(saved.ratio);
      }
    });

    const startY = window.scrollY;
    let frame = 0;
    let lastSave = 0;
    let celebrated = false;

    const update = () => {
      frame = 0;
      const ratio = readingRatio(el);
      if (barRef.current) barRef.current.style.transform = `scaleX(${ratio})`;

      if (Math.abs(window.scrollY - startY) > DISMISS_SCROLL) setResumeRatio(null);

      const now = Date.now();
      if (ratio >= FINISHED) {
        clearPosition(storageKey);
        if (!celebrated && Math.abs(window.scrollY - startY) > CELEBRATE_SCROLL) {
          celebrated = true;
          sendPetCommand({ type: 'say', text: FINISH_LINES[Math.floor(Math.random() * FINISH_LINES.length)], ms: 4500 });
          petalBurst();
        }
      } else if (ratio >= MIN_RESUME && now - lastSave > SAVE_INTERVAL) {
        lastSave = now;
        savePosition(storageKey, ratio);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(promptFrame);
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [storageKey, mounted]);

  useEffect(() => {
    if (resumeRatio === null) return;
    const timer = window.setTimeout(() => setResumeRatio(null), PROMPT_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [resumeRatio]);

  const resume = () => {
    const el = document.getElementById(ARTICLE_CONTENT_ID);
    if (!el || resumeRatio === null) return;
    const rect = el.getBoundingClientRect();
    const top = window.scrollY + rect.top + resumeRatio * Math.max(0, rect.height - window.innerHeight);
    setResumeRatio(null);
    window.scrollTo({ top, behavior: 'smooth' });
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]" aria-hidden="true">
        <div
          ref={barRef}
          className="h-full origin-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>

      <AnimatePresence>
        {resumeRatio !== null && (
          <motion.div
            role="status"
            className="glass-float rounded-full fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-1 p-1.5 pl-4 text-sm"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">
              上次读到 <b className="tabular-nums text-indigo-600 dark:text-indigo-400">{Math.round(resumeRatio * 100)}%</b>
            </span>
            <button
              type="button"
              onClick={resume}
              className="ml-2 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-indigo-500 px-3.5 py-1.5 font-bold text-white shadow-md transition-colors hover:bg-indigo-600"
            >
              <BookOpen size={15} /> 继续阅读
            </button>
            <button
              type="button"
              aria-label="不用了"
              onClick={() => setResumeRatio(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-500/10 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
