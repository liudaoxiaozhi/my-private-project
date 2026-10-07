"use client";
// components/novel/NovelReader.tsx —— 小说沉浸式阅读器
//
// - 四种底色（白纸 / 羊皮纸 / 护眼绿 / 夜间）、字号、行距、宋体 / 黑体，设置记在读者浏览器里
// - 自动记住读到哪一章、哪个位置；回到同一章时恢复位置
// - 顶部细进度条；往下读时工具栏自动收起，往上滑或停在顶部时出现
// - 键盘 ← / → 翻章；工具栏带背景音乐按钮

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, House, List, X } from 'lucide-react';
import NovelMusicButton from './NovelMusicButton';
import { useTheme } from '../ThemeProvider';
import {
  FONT_SIZES, LINE_HEIGHTS, loadProgress, loadSettings, saveProgress, saveSettings,
} from '../../lib/novelProgress';
import type { ReaderFont, ReaderSettings, ReaderTheme } from '../../lib/novelProgress';
import '../../app/novel/reader.css';

interface ChapterLink {
  href: string;
  title: string;
}

export interface NovelReaderProps {
  bookTitle: string;
  volumeTitle: string;
  chapterTitle: string;
  /** 已格式化的发布日期，可能为空 */
  dateText: string;
  wordCount: number;
  html: string;
  href: string;
  prev: ChapterLink | null;
  next: ChapterLink | null;
  position: number;
  total: number;
  /** 最后一章且连载中时，在章末显示「待续」提示 */
  isOngoing: boolean;
}

const THEMES: Array<{ id: ReaderTheme; label: string; swatch: string }> = [
  { id: 'paper', label: '白纸', swatch: '#f7f5ef' },
  { id: 'sepia', label: '羊皮纸', swatch: '#f1e7d0' },
  { id: 'green', label: '护眼', swatch: '#e2ead6' },
  { id: 'night', label: '夜间', swatch: '#141518' },
];
const FONTS: Array<{ id: ReaderFont; label: string }> = [
  { id: 'serif', label: '宋体' },
  { id: 'sans', label: '黑体' },
];

const SAVE_INTERVAL_MS = 600;

function nearest<T extends number>(list: readonly T[], value: unknown, fallback: T): T {
  if (typeof value !== 'number') return fallback;
  return list.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), fallback);
}

function scrollRatio(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
}

const ICON_BTN =
  'flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300 ease-out hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40';

export default function NovelReader(props: NovelReaderProps) {
  const { bookTitle, volumeTitle, chapterTitle, dateText, wordCount, html, href, prev, next, position, total, isOngoing } = props;
  const router = useRouter();
  const { isDark } = useTheme();

  // 首帧用固定默认值（与服务端一致），挂载后再读本地设置
  const [settings, setSettings] = useState<ReaderSettings>({ fontSize: 18, lineHeight: 1.9, font: 'serif', theme: 'paper' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const [restoredNotice, setRestoredNotice] = useState(false);
  const [ready, setReady] = useState(false);
  const lastY = useRef(0);
  const lastSave = useRef(0);
  /** 本章当前阅读比例；切章时用它保存上一章的进度，而不是读取已经换成新章节的页面 */
  const ratioRef = useRef(0);
  /** 恢复位置完成前不保存，避免把「第 0 行」覆盖掉上次的进度 */
  const canPersist = useRef(false);

  // ---------- 读取设置；首次阅读时跟随站点日夜模式 ----------
  useEffect(() => {
    const saved = loadSettings();
    setSettings({
      fontSize: nearest(FONT_SIZES, saved?.fontSize, 18),
      lineHeight: nearest(LINE_HEIGHTS, saved?.lineHeight, 1.9),
      font: saved?.font === 'sans' ? 'sans' : 'serif',
      theme: THEMES.some((t) => t.id === saved?.theme) ? (saved!.theme as ReaderTheme) : isDark ? 'night' : 'paper',
    });
    setReady(true);
    // 只在进入页面时读取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((prevSettings) => {
      const merged = { ...prevSettings, ...patch };
      saveSettings(merged);
      return merged;
    });
  };

  // ---------- 保存进度 ----------
  const persist = useCallback(() => {
    if (!canPersist.current) return;
    saveProgress({ href, title: chapterTitle, volumeTitle, ratio: ratioRef.current, savedAt: Date.now() });
  }, [href, chapterTitle, volumeTitle]);

  // ---------- 进入章节：等字号等设置生效后，恢复上次位置或回到顶部 ----------
  useEffect(() => {
    if (!ready) return;
    canPersist.current = false;
    const saved = loadProgress();
    const target = saved?.href === href && saved.ratio > 0.02 && saved.ratio < 0.98 ? saved.ratio : 0;
    let timer: number | undefined;
    // 两帧之后排版才稳定（字号、行距已应用）
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: target * Math.max(0, max) });
      ratioRef.current = scrollRatio();
      setProgress(ratioRef.current);
      canPersist.current = true;
      persist();
      if (target > 0) {
        setRestoredNotice(true);
        timer = window.setTimeout(() => setRestoredNotice(false), 2400);
      }
    }));
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [ready, href, persist]);

  // ---------- 滚动：进度条、工具栏显隐、定期保存 ----------
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      ratioRef.current = scrollRatio();
      setProgress(ratioRef.current);
      setBarVisible(y < 80 || y < lastY.current);
      lastY.current = y;
      const now = Date.now();
      if (now - lastSave.current > SAVE_INTERVAL_MS) {
        lastSave.current = now;
        persist();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
      persist(); // 离开本章（翻章、返回目录）前保存最后位置
    };
  }, [persist]);

  // ---------- 键盘翻章 / Esc 关闭设置 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === 'Escape') setSettingsOpen(false);
      if (e.key === 'ArrowLeft' && prev) router.push(prev.href);
      if (e.key === 'ArrowRight' && next) router.push(next.href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, router]);

  const showBar = barVisible || settingsOpen;
  const fontIndex = FONT_SIZES.indexOf(settings.fontSize as (typeof FONT_SIZES)[number]);

  return (
    <div className="nv-reader relative min-h-[100dvh]" data-theme={settings.theme} data-font={settings.font}>
      {/* 底色铺满整屏，盖住站点背景与特效 */}
      <div className="nv-ground fixed inset-0 -z-10" aria-hidden="true" />

      {/* 顶部阅读进度 */}
      <div className="fixed inset-x-0 top-0 z-40 h-[2px]" aria-hidden="true">
        <div className="h-full origin-left bg-[var(--nv-accent)] transition-transform duration-150 ease-out" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* ---------- 工具栏 ---------- */}
      <header
        className={`nv-bar fixed inset-x-0 top-0 z-30 border-b backdrop-blur-md transition-transform duration-300 ease-out ${showBar ? 'translate-y-0' : '-translate-y-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 sm:px-5">
          <Link href="/novel" className={ICON_BTN} aria-label="返回目录" title="目录">
            <List size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{chapterTitle}</p>
            <p className="nv-muted truncate text-[11px]">{bookTitle} · {volumeTitle}</p>
          </div>
          <NovelMusicButton showTitle={false} className="sm:hidden" />
          <NovelMusicButton className="hidden sm:flex" />
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            aria-controls="nv-settings"
            aria-label="阅读设置"
            title="阅读设置"
            className={`${ICON_BTN} text-[15px] font-bold ${settingsOpen ? 'bg-current/10' : ''}`}
          >
            Aa
          </button>
          <Link href="/" className={`${ICON_BTN} hidden sm:flex`} aria-label="回到首页" title="首页">
            <House size={17} />
          </Link>
        </div>

        {/* ---------- 设置面板 ---------- */}
        {settingsOpen && (
          <div id="nv-settings" role="dialog" aria-label="阅读设置" className="nv-line mx-auto max-w-5xl border-t px-4 pb-5 pt-4 sm:px-5">
            <div className="mx-auto grid max-w-xl gap-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="nv-muted w-12 shrink-0">字号</span>
                <div className="flex flex-1 items-center gap-3">
                  <button type="button" aria-label="缩小字号" disabled={fontIndex <= 0}
                    onClick={() => updateSettings({ fontSize: FONT_SIZES[Math.max(0, fontIndex - 1)] })}
                    className="nv-line rounded-full border px-3 py-1 text-xs transition-colors duration-300 hover:bg-current/10 disabled:opacity-30">A−</button>
                  <input
                    id="nv-font-size"
                    type="range"
                    min={0}
                    max={FONT_SIZES.length - 1}
                    value={Math.max(0, fontIndex)}
                    onChange={(e) => updateSettings({ fontSize: FONT_SIZES[Number(e.target.value)] })}
                    aria-label="字号"
                    className="nv-range flex-1"
                  />
                  <button type="button" aria-label="放大字号" disabled={fontIndex >= FONT_SIZES.length - 1}
                    onClick={() => updateSettings({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, fontIndex + 1)] })}
                    className="nv-line rounded-full border px-3 py-1 text-base transition-colors duration-300 hover:bg-current/10 disabled:opacity-30">A+</button>
                  <span className="w-10 text-right tabular-nums">{settings.fontSize}px</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="nv-muted w-12 shrink-0">行距</span>
                <div className="flex flex-1 gap-2">
                  {LINE_HEIGHTS.map((lh, i) => (
                    <button key={lh} type="button" onClick={() => updateSettings({ lineHeight: lh })} aria-pressed={settings.lineHeight === lh}
                      className={`nv-line flex-1 rounded-full border py-1.5 text-xs transition-colors duration-300 ${settings.lineHeight === lh ? 'bg-current/10 font-bold' : 'hover:bg-current/5'}`}>
                      {['紧凑', '适中', '宽松'][i]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="nv-muted w-12 shrink-0">字体</span>
                <div className="flex flex-1 gap-2">
                  {FONTS.map((f) => (
                    <button key={f.id} type="button" onClick={() => updateSettings({ font: f.id })} aria-pressed={settings.font === f.id}
                      className={`nv-line flex-1 rounded-full border py-1.5 text-xs transition-colors duration-300 ${settings.font === f.id ? 'bg-current/10 font-bold' : 'hover:bg-current/5'}`}
                      style={{ fontFamily: f.id === 'serif' ? 'var(--font-serif), serif' : 'system-ui, sans-serif' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="nv-muted w-12 shrink-0">底色</span>
                <div className="flex flex-1 gap-2">
                  {THEMES.map((t) => (
                    <button key={t.id} type="button" onClick={() => updateSettings({ theme: t.id })} aria-pressed={settings.theme === t.id}
                      className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] transition-colors duration-300 ${settings.theme === t.id ? 'bg-current/10 font-bold' : 'hover:bg-current/5'}`}>
                      <span className="h-6 w-6 rounded-full ring-1 ring-black/15" style={{ background: t.swatch }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" onClick={() => setSettingsOpen(false)} className="nv-muted mx-auto flex items-center gap-1 text-xs hover:underline">
                <X size={13} /> 收起
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ---------- 正文 ---------- */}
      <main className="mx-auto w-full px-5 pb-16 pt-24 sm:px-8 sm:pt-28" style={{ maxWidth: `calc(${settings.fontSize}px * 38 + 4rem)` }}>
        <header className="mb-10 text-center">
          <p className="nv-muted text-xs tracking-[0.3em]">{volumeTitle}</p>
          <h1 className="mt-3 font-bold leading-snug [text-wrap:balance]" style={{ fontSize: settings.fontSize * 1.45 }}>
            {chapterTitle}
          </h1>
          <p className="nv-muted mt-3 text-xs tabular-nums">
            {[dateText, `${wordCount.toLocaleString('en-US')} 字`, `第 ${position} / ${total} 章`].filter(Boolean).join(' · ')}
          </p>
        </header>

        <article
          className="nv-content"
          style={{ fontSize: settings.fontSize, lineHeight: settings.lineHeight }}
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {!next && isOngoing && (
          <p className="nv-muted mt-12 text-center text-sm">（未完待续）</p>
        )}

        {/* ---------- 章末翻页 ---------- */}
        <nav aria-label="章节翻页" className="nv-line mt-14 grid grid-cols-3 gap-3 border-t pt-8 text-sm">
          {prev ? (
            <Link href={prev.href} className="nv-line group flex flex-col items-start gap-1 rounded-2xl border px-4 py-3 transition-colors duration-300 hover:bg-current/5">
              <span className="nv-muted flex items-center gap-1 text-xs"><ChevronLeft size={14} /> 上一章</span>
              <span className="line-clamp-1 font-bold">{prev.title}</span>
            </Link>
          ) : <span />}
          <Link href="/novel" className="nv-line flex flex-col items-center justify-center gap-1 rounded-2xl border px-4 py-3 transition-colors duration-300 hover:bg-current/5">
            <List size={16} className="nv-muted" />
            <span className="font-bold">目录</span>
          </Link>
          {next ? (
            <Link href={next.href} className="nv-line flex flex-col items-end gap-1 rounded-2xl border px-4 py-3 text-right transition-colors duration-300 hover:bg-current/5">
              <span className="nv-muted flex items-center gap-1 text-xs">下一章 <ChevronRight size={14} /></span>
              <span className="line-clamp-1 font-bold">{next.title}</span>
            </Link>
          ) : <span />}
        </nav>
        <p className="nv-muted mt-6 hidden text-center text-[11px] md:block">键盘 ← → 翻章</p>
      </main>

      {/* 恢复阅读位置的提示 */}
      <div
        role="status"
        className={`nv-bar fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-xs shadow-lg backdrop-blur-md transition-all duration-300 ${restoredNotice ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
      >
        已回到上次读到的位置
      </div>
    </div>
  );
}
