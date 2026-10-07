"use client";
// components/novel/EpubReader.tsx —— 本地 EPUB 阅读器
//
// 读者从自己的设备选择 EPUB（或拖进来），在浏览器里解析和阅读；文件不会上传到服务器，网站里也不存任何书。
// 打开过的书存在读者自己浏览器的 IndexedDB 里，下次点一下继续读；阅读进度按书分别保存。
// 阅读界面与站内小说阅读器一致：四种底色、字号、行距、字体，目录抽屉，← → 翻节，书内链接跳转。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent } from 'react';
import Link from 'next/link';
import {
  BookOpen, ChevronLeft, ChevronRight, FileUp, House, Library, List, LoaderCircle, ShieldCheck, Trash2, X,
} from 'lucide-react';
import NovelMusicButton from './NovelMusicButton';
import { ReaderSettingsPanel, useReaderSettings } from './ReaderSettings';
import { openEpub } from '../../lib/epub/epub';
import type { EpubBook } from '../../lib/epub/epub';
import {
  bookIdOf, deleteLocalBook, listLocalBooks, loadEpubProgress, saveEpubProgress, saveLocalBook,
} from '../../lib/epub/library';
import type { LocalBook } from '../../lib/epub/library';
import '../../app/novel/reader.css';

interface OpenBook {
  id: string;
  epub: EpubBook;
}

/** 进入一节后要恢复到的位置 */
type Restore = { kind: 'ratio'; ratio: number } | { kind: 'fragment'; fragment: string } | null;

const SAVE_INTERVAL_MS = 600;
const ICON_BTN =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-out hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40';
const CARD_BTN = 'nv-line flex flex-col gap-1 rounded-2xl border px-4 py-3 text-sm transition-colors duration-300 hover:bg-current/5 disabled:opacity-40';

function scrollRatio(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
}

const formatSize = (bytes: number): string => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function EpubReader() {
  const { settings, ready, updateSettings } = useReaderSettings();

  const [library, setLibrary] = useState<LocalBook[] | null>(null);
  const [book, setBook] = useState<OpenBook | null>(null);
  const [index, setIndex] = useState(0);
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const [restoredNotice, setRestoredNotice] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const restore = useRef<Restore>(null);
  const ratioRef = useRef(0);
  const canPersist = useRef(false);
  const lastY = useRef(0);
  const lastSave = useRef(0);
  const bookRef = useRef<OpenBook | null>(null);
  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  // ---------- 本地书架 ----------
  const refreshLibrary = useCallback(async () => setLibrary(await listLocalBooks()), []);
  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  // 书架封面的 blob 地址：书架变化时重新生成并释放旧的
  const coverUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of library ?? []) if (b.cover) map.set(b.id, URL.createObjectURL(b.cover));
    return map;
  }, [library]);
  useEffect(() => () => coverUrls.forEach((url) => URL.revokeObjectURL(url)), [coverUrls]);

  // 离开页面时释放当前书占用的内存
  useEffect(() => () => bookRef.current?.epub.dispose(), []);

  // ---------- 进度 ----------
  const persist = useCallback(() => {
    const current = bookRef.current;
    if (!current || !canPersist.current) return;
    saveEpubProgress(current.id, { index, ratio: ratioRef.current, savedAt: Date.now() });
  }, [index]);

  // ---------- 打开书 ----------
  const startReading = useCallback((id: string, epub: EpubBook) => {
    bookRef.current?.epub.dispose();
    const saved = loadEpubProgress(id);
    const start = saved && saved.index < epub.sectionCount ? saved.index : 0;
    restore.current = saved && saved.index === start && saved.ratio > 0.02 ? { kind: 'ratio', ratio: saved.ratio } : null;
    canPersist.current = false;
    setHtml('');
    setTocOpen(false);
    setSettingsOpen(false);
    setIndex(start);
    const opened = { id, epub };
    bookRef.current = opened;
    setBook(opened);
    window.scrollTo({ top: 0 });
  }, []);

  const openFile = async (file: File) => {
    setError(null);
    if (!/\.epub$/i.test(file.name) && file.type !== 'application/epub+zip') {
      setError('只支持 .epub 格式的电子书');
      return;
    }
    setBusy(true);
    try {
      const epub = await openEpub(file);
      const id = await bookIdOf(file, file.name);
      const now = Date.now();
      const existing = library?.find((b) => b.id === id);
      await saveLocalBook({
        id, title: epub.title, author: epub.author, size: file.size,
        addedAt: existing?.addedAt ?? now, openedAt: now, file, cover: epub.coverBlob,
      });
      startReading(id, epub);
      void refreshLibrary();
    } catch (e) {
      setError(e instanceof Error ? e.message : '打开失败，文件可能已损坏');
    } finally {
      setBusy(false);
    }
  };

  const openSaved = async (rec: LocalBook) => {
    setError(null);
    setBusy(true);
    try {
      const epub = await openEpub(rec.file);
      await saveLocalBook({ ...rec, openedAt: Date.now() });
      startReading(rec.id, epub);
      void refreshLibrary();
    } catch (e) {
      setError(e instanceof Error ? e.message : '打开失败');
    } finally {
      setBusy(false);
    }
  };

  const removeSaved = async (rec: LocalBook) => {
    if (!window.confirm(`从本地书架移除《${rec.title}》？（只删除浏览器里保存的这份，不影响你电脑上的原文件）`)) return;
    await deleteLocalBook(rec.id);
    void refreshLibrary();
  };

  const closeBook = () => {
    persist();
    bookRef.current?.epub.dispose();
    bookRef.current = null;
    setBook(null);
    setHtml('');
    void refreshLibrary();
    window.scrollTo({ top: 0 });
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void openFile(file);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void openFile(file);
  };

  // ---------- 载入当前一节 ----------
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    canPersist.current = false;
    book.epub.sectionHtml(index)
      .then((next) => {
        if (!cancelled) setHtml(next || '<p>（本节没有文字内容）</p>');
      })
      .catch(() => {
        if (!cancelled) setHtml('<p>（这一节解析失败，试试下一节）</p>');
      });
    return () => {
      cancelled = true;
    };
  }, [book, index]);

  // ---------- 内容渲染后：恢复位置 / 跳到锚点 / 回到顶部 ----------
  useEffect(() => {
    if (!book || !html || !ready) return;
    let timer: number | undefined;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = restore.current;
      restore.current = null;
      if (target?.kind === 'fragment' && target.fragment) {
        document.getElementById(`ep-${target.fragment}`)?.scrollIntoView({ block: 'start' });
      } else if (target?.kind === 'ratio') {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: target.ratio * Math.max(0, max) });
        setRestoredNotice(true);
        timer = window.setTimeout(() => setRestoredNotice(false), 2400);
      } else {
        window.scrollTo({ top: 0 });
      }
      ratioRef.current = scrollRatio();
      setProgress(ratioRef.current);
      canPersist.current = true;
      persist();
    }));
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [book, html, ready, persist]);

  // ---------- 滚动：进度条、工具栏显隐、定期保存 ----------
  useEffect(() => {
    if (!book) return;
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
    };
  }, [book, persist]);

  // ---------- 翻节 ----------
  const goTo = useCallback((next: number, fragment = '') => {
    const current = bookRef.current;
    if (!current || next < 0 || next >= current.epub.sectionCount) return;
    setTocOpen(false);
    if (next === index) {
      if (fragment) document.getElementById(`ep-${fragment}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    persist();
    canPersist.current = false;
    restore.current = fragment ? { kind: 'fragment', fragment } : null;
    // 先清空旧内容：恢复位置的逻辑只在新一节渲染出来之后才运行
    setHtml('');
    setIndex(next);
  }, [index, persist]);

  useEffect(() => {
    if (!book) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        setTocOpen(false);
      }
      if (e.key === 'ArrowLeft') goTo(index - 1);
      if (e.key === 'ArrowRight') goTo(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [book, index, goTo]);

  // 书内链接（注释、目录页等）由阅读器接管
  const onContentClick = (e: MouseEvent<HTMLElement>) => {
    const anchor = (e.target as HTMLElement).closest('a[data-href]');
    if (!anchor || !book) return;
    e.preventDefault();
    const target = book.epub.resolveLink(anchor.getAttribute('data-href') ?? '');
    if (target) goTo(target.spineIndex, target.fragment);
  };

  // 目录里高亮当前所在的条目：阅读顺序不超过当前节的最后一条
  const activeToc = useMemo(() => {
    if (!book) return -1;
    let hit = -1;
    book.epub.toc.forEach((t, i) => {
      if (t.spineIndex <= index) hit = i;
    });
    return hit;
  }, [book, index]);

  const showBar = barVisible || settingsOpen || tocOpen;

  // ============================== 书架视图 ==============================
  if (!book) {
    return (
      <div className="nv-reader relative min-h-[100dvh]" data-theme={settings.theme} data-font={settings.font}>
        <div className="nv-ground fixed inset-0 -z-10" aria-hidden="true" />

        <header className="nv-bar sticky top-0 z-30 border-b backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-3 sm:px-5">
            <Link href="/novel" className={ICON_BTN} aria-label="返回书架" title="返回书架">
              <ChevronLeft size={18} />
            </Link>
            <p className="min-w-0 flex-1 truncate text-sm font-bold">本地 EPUB 阅读器</p>
            <button type="button" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen} aria-controls="nv-settings"
              aria-label="阅读设置" title="阅读设置" className={`${ICON_BTN} text-[15px] font-bold ${settingsOpen ? 'bg-current/10' : ''}`}>
              Aa
            </button>
            <Link href="/" className={ICON_BTN} aria-label="回到首页" title="首页">
              <House size={17} />
            </Link>
          </div>
          {settingsOpen && <ReaderSettingsPanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
        </header>

        <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6">
          {/* 选择 / 拖入文件 */}
          <section
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`nv-line flex flex-col items-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-300 ${dragging ? 'bg-current/10' : ''}`}
          >
            <FileUp size={36} className="nv-accent" />
            <h1 className="mt-4 text-xl font-bold">打开一本 EPUB</h1>
            <p className="nv-muted mt-2 max-w-md text-sm leading-relaxed">选择或拖入你设备上的 .epub 文件，直接在浏览器里阅读。</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--nv-accent)] px-6 py-3 text-sm font-bold text-[var(--nv-bg)] shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <BookOpen size={16} />}
              {busy ? '正在打开…' : '选择 EPUB 文件'}
            </button>
            <input ref={fileInput} type="file" accept=".epub,application/epub+zip" onChange={onPick} className="hidden" />
            {error && <p role="alert" className="mt-4 text-sm font-bold text-red-500">{error}</p>}
            <p className="nv-muted mt-6 flex items-center gap-1.5 text-xs">
              <ShieldCheck size={14} /> 文件只在你的浏览器里打开，不会上传到服务器
            </p>
          </section>

          {/* 最近读过 */}
          <section className="mt-10" aria-labelledby="epub-recent">
            <h2 id="epub-recent" className="nv-muted mb-4 flex items-center gap-2 px-1 text-sm font-bold tracking-widest">
              <Library size={15} /> 最近读过
            </h2>
            {library === null ? (
              <p className="nv-muted px-1 text-sm">读取中…</p>
            ) : library.length === 0 ? (
              <p className="nv-muted px-1 text-sm">还没有打开过书。打开过的书会保存在这台设备的浏览器里，下次点一下就能接着读。</p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {library.map((rec) => {
                  const saved = loadEpubProgress(rec.id);
                  const cover = coverUrls.get(rec.id);
                  return (
                    <li key={rec.id} className="group relative">
                      <button type="button" onClick={() => void openSaved(rec)} disabled={busy} className="block w-full text-left">
                        <span className="nv-line relative block aspect-[3/4] overflow-hidden rounded-xl border shadow-md transition-transform duration-300 group-hover:-translate-y-1">
                          {cover ? (
                            // blob 地址无法交给 next/image 优化，这里用原生 img
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-3 text-center text-sm font-bold text-white">
                              {rec.title}
                            </span>
                          )}
                        </span>
                        <span className="mt-2 line-clamp-2 block text-sm font-bold leading-snug">{rec.title}</span>
                        <span className="nv-muted mt-0.5 block truncate text-xs">
                          {[rec.author, saved ? `读到第 ${saved.index + 1} 节` : '未开始', formatSize(rec.size)].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSaved(rec)}
                        aria-label={`移除《${rec.title}》`}
                        title="从本地书架移除"
                        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-200 hover:bg-red-500 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
      </div>
    );
  }

  // ============================== 阅读视图 ==============================
  const { epub } = book;
  const prevTitle = index > 0 ? epub.sectionTitle(index - 1) : '';
  const nextTitle = index < epub.sectionCount - 1 ? epub.sectionTitle(index + 1) : '';

  return (
    <div className="nv-reader relative min-h-[100dvh]" data-theme={settings.theme} data-font={settings.font}>
      <div className="nv-ground fixed inset-0 -z-10" aria-hidden="true" />

      <div className="fixed inset-x-0 top-0 z-40 h-[2px]" aria-hidden="true">
        <div className="h-full origin-left bg-[var(--nv-accent)] transition-transform duration-150 ease-out" style={{ transform: `scaleX(${progress})` }} />
      </div>

      {/* ---------- 工具栏 ---------- */}
      <header
        className={`nv-bar fixed inset-x-0 top-0 z-30 border-b backdrop-blur-md transition-transform duration-300 ease-out ${showBar ? 'translate-y-0' : '-translate-y-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 sm:px-5">
          <button type="button" onClick={closeBook} className={ICON_BTN} aria-label="返回本地书架" title="本地书架">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => setTocOpen(true)} className={ICON_BTN} aria-label="目录" title="目录" disabled={epub.toc.length === 0}>
            <List size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{epub.sectionTitle(index)}</p>
            <p className="nv-muted truncate text-[11px]">{[epub.title, epub.author].filter(Boolean).join(' · ')}</p>
          </div>
          <NovelMusicButton showTitle={false} className="sm:hidden" />
          <NovelMusicButton className="hidden sm:flex" />
          <button type="button" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen} aria-controls="nv-settings"
            aria-label="阅读设置" title="阅读设置" className={`${ICON_BTN} text-[15px] font-bold ${settingsOpen ? 'bg-current/10' : ''}`}>
            Aa
          </button>
        </div>
        {settingsOpen && <ReaderSettingsPanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />}
      </header>

      {/* ---------- 目录抽屉 ---------- */}
      {tocOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="目录">
          <button type="button" aria-label="关闭目录" onClick={() => setTocOpen(false)} className="absolute inset-0 bg-black/40" />
          <nav className="nv-bar absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r shadow-2xl backdrop-blur-md">
            <div className="nv-line flex h-14 shrink-0 items-center justify-between border-b px-4">
              <p className="truncate text-sm font-bold">{epub.title}</p>
              <button type="button" onClick={() => setTocOpen(false)} className={ICON_BTN} aria-label="关闭目录">
                <X size={17} />
              </button>
            </div>
            <ol className="flex-1 overflow-y-auto overscroll-contain py-2">
              {epub.toc.map((t, i) => (
                <li key={`${i}-${t.title}`}>
                  <button
                    type="button"
                    onClick={() => goTo(t.spineIndex, t.fragment)}
                    aria-current={i === activeToc ? 'true' : undefined}
                    className={`block w-full truncate py-2.5 pr-4 text-left text-sm transition-colors duration-200 hover:bg-current/5 ${i === activeToc ? 'nv-accent font-bold' : ''}`}
                    style={{ paddingLeft: 16 + Math.min(t.depth, 4) * 14 }}
                  >
                    {t.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      )}

      {/* ---------- 正文 ---------- */}
      <main className="mx-auto w-full px-5 pb-16 pt-24 sm:px-8 sm:pt-28" style={{ maxWidth: `calc(${settings.fontSize}px * 38 + 4rem)` }}>
        {html ? (
          <article
            className="nv-content nv-epub"
            style={{ fontSize: settings.fontSize, lineHeight: settings.lineHeight }}
            onClick={onContentClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="nv-muted flex items-center justify-center gap-2 py-24 text-sm">
            <LoaderCircle size={16} className="animate-spin" /> 正在载入…
          </p>
        )}

        <nav aria-label="翻页" className="nv-line mt-14 grid grid-cols-3 gap-3 border-t pt-8 text-sm">
          {prevTitle ? (
            <button type="button" onClick={() => goTo(index - 1)} className={`${CARD_BTN} items-start text-left`}>
              <span className="nv-muted flex items-center gap-1 text-xs"><ChevronLeft size={14} /> 上一节</span>
              <span className="line-clamp-1 font-bold">{prevTitle}</span>
            </button>
          ) : <span />}
          <button type="button" onClick={() => setTocOpen(true)} className={`${CARD_BTN} items-center justify-center`} disabled={epub.toc.length === 0}>
            <List size={16} className="nv-muted" />
            <span className="font-bold tabular-nums">{index + 1} / {epub.sectionCount}</span>
          </button>
          {nextTitle ? (
            <button type="button" onClick={() => goTo(index + 1)} className={`${CARD_BTN} items-end text-right`}>
              <span className="nv-muted flex items-center gap-1 text-xs">下一节 <ChevronRight size={14} /></span>
              <span className="line-clamp-1 font-bold">{nextTitle}</span>
            </button>
          ) : <span />}
        </nav>
        <p className="nv-muted mt-6 hidden text-center text-[11px] md:block">键盘 ← → 翻页 · Esc 关闭面板</p>
      </main>

      <div
        role="status"
        className={`nv-bar fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-xs shadow-lg backdrop-blur-md transition-all duration-300 ${restoredNotice ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
      >
        已回到上次读到的位置
      </div>
    </div>
  );
}
