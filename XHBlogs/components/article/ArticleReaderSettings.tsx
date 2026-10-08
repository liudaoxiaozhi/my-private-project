"use client";
// components/article/ArticleReaderSettings.tsx —— 文章阅读设置：字号 / 行距 / 字体 / 专注模式
//
// 服务端与首次 Hydration 用默认值（避免不一致），之后读取本地设置；
// 字体选项沿用小说阅读器（宋体 / 黑体），设置与小说阅读器分开保存，互不影响。

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Type } from 'lucide-react';
import {
  ARTICLE_LEADINGS,
  ARTICLE_SCALES,
  DEFAULT_ARTICLE_SETTINGS,
  applyArticleSettings,
  getArticleSettings,
  saveArticleSettings,
  subscribeArticleSettings,
} from '../../lib/articleReader';
import type { ArticleSettings } from '../../lib/articleReader';

const LEADING_LABELS = ['紧凑', '适中', '宽松'];
const FONTS: Array<{ id: ArticleSettings['font']; label: string; family: string }> = [
  { id: 'serif', label: '宋体', family: 'var(--font-serif), serif' },
  { id: 'sans', label: '黑体', family: 'system-ui, sans-serif' },
];

const chip = (active: boolean) =>
  `flex-1 rounded-full border py-1.5 text-xs transition-colors duration-300 ${
    active
      ? 'border-indigo-500 bg-indigo-500 font-bold text-white shadow-sm'
      : 'border-slate-300/70 text-slate-600 hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-600 dark:text-slate-300'
  }`;

export default function ArticleReaderSettings({ allowFocus = true }: { allowFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const settings = useSyncExternalStore(subscribeArticleSettings, getArticleSettings, () => DEFAULT_ARTICLE_SETTINGS);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 把设置同步到正文容器上的 CSS 变量（站内跳转时首屏脚本不会再执行，靠这里套用）
  useEffect(() => {
    applyArticleSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const update = (patch: Partial<ArticleSettings>) => saveArticleSettings({ ...settings, ...patch });

  const scaleIndex = Math.max(0, ARTICLE_SCALES.indexOf(settings.scale as (typeof ARTICLE_SCALES)[number]));
  const isDefault =
    settings.scale === DEFAULT_ARTICLE_SETTINGS.scale &&
    settings.leading === DEFAULT_ARTICLE_SETTINGS.leading &&
    settings.font === DEFAULT_ARTICLE_SETTINGS.font &&
    settings.focus === DEFAULT_ARTICLE_SETTINGS.focus;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm transition-colors duration-300 md:px-4 md:py-2 md:text-sm ${
          open
            ? 'border-indigo-500 bg-indigo-500 text-white'
            : 'border-white/20 bg-white/30 text-slate-600 hover:text-indigo-600 dark:border-white/5 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-indigo-400'
        }`}
      >
        <Type size={15} /> 阅读设置
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="阅读设置"
            className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-white/60 bg-white/95 p-4 text-sm text-slate-700 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/95 dark:text-slate-200"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
          >
            <div className="grid gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span>字号</span>
                  <span className="tabular-nums">{Math.round(settings.scale * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" aria-label="缩小字号" disabled={scaleIndex <= 0}
                    onClick={() => update({ scale: ARTICLE_SCALES[scaleIndex - 1] })}
                    className="rounded-full border border-slate-300/70 px-2.5 py-0.5 text-xs transition-colors hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-30 dark:border-slate-600">A−</button>
                  <input
                    type="range"
                    min={0}
                    max={ARTICLE_SCALES.length - 1}
                    value={scaleIndex}
                    onChange={(e) => update({ scale: ARTICLE_SCALES[Number(e.target.value)] })}
                    aria-label="字号"
                    className="flex-1 accent-indigo-500"
                  />
                  <button type="button" aria-label="放大字号" disabled={scaleIndex >= ARTICLE_SCALES.length - 1}
                    onClick={() => update({ scale: ARTICLE_SCALES[scaleIndex + 1] })}
                    className="rounded-full border border-slate-300/70 px-2.5 py-0.5 text-base leading-tight transition-colors hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-30 dark:border-slate-600">A+</button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">行距</div>
                <div className="flex gap-2">
                  {ARTICLE_LEADINGS.map((lh, i) => (
                    <button key={lh} type="button" aria-pressed={settings.leading === lh} onClick={() => update({ leading: lh })} className={chip(settings.leading === lh)}>
                      {LEADING_LABELS[i]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold text-slate-500 dark:text-slate-400">字体</div>
                <div className="flex gap-2">
                  {FONTS.map((f) => (
                    <button key={f.id} type="button" aria-pressed={settings.font === f.id} onClick={() => update({ font: f.id })}
                      className={chip(settings.font === f.id)} style={{ fontFamily: f.family }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {allowFocus && (
                <label className="hidden cursor-pointer items-center justify-between gap-3 lg:flex">
                  <span>
                    <span className="block text-xs font-bold text-slate-500 dark:text-slate-400">专注模式</span>
                    <span className="text-[11px] text-slate-400">隐藏侧栏，只留正文</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.focus}
                    onChange={(e) => update({ focus: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-indigo-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 dark:bg-slate-600" />
                </label>
              )}

              <button
                type="button"
                disabled={isDefault}
                onClick={() => update(DEFAULT_ARTICLE_SETTINGS)}
                className="flex items-center justify-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-indigo-500 disabled:pointer-events-none disabled:opacity-40"
              >
                <RotateCcw size={12} /> 恢复默认
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
