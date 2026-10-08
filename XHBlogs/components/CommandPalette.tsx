"use client";
// components/CommandPalette.tsx —— ⌘K / Ctrl+K 命令面板（也可以按 /，或点导航栏的搜索按钮、手机轮盘的「搜索」）
//
// - 搜：文章、杂谈、书架、追番（索引在构建时生成，第一次打开才下载，见 app/search-index.json/route.ts）
// - 跳：全部栏目、最近看过的页面
// - 做：切换日夜、播放 / 暂停音乐、随机看一篇、复制链接、回到顶部、召回桌宠
// - 工具：特效档位、白噪音、今日御神签直接在面板里打开（手机上没有左下角工具箱，从这里用）
// 全键盘操作：↑↓ 选择，回车执行，Esc 返回 / 关闭。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowUp, AudioWaveform, BookOpen, Clapperboard, Clock, CornerDownLeft, Dices, FileText,
  Link2, Moon, Music, PawPrint, Pause, Play, Search, SkipForward, Sparkles, Sun, MessageSquareText, Compass,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useMusic } from './MusicProvider';
import EffectsTool from './toolbox/EffectsTool';
import AmbientTool from './toolbox/AmbientTool';
import OmikujiTool from './toolbox/OmikujiTool';
import { ALL_NAV_LINKS } from '../lib/navigation';
import { OPEN_PALETTE_EVENT } from '../lib/commandPalette';
import { SEARCH_INDEX_URL } from '../lib/searchIndex';
import type { SearchEntry, SearchIndex } from '../lib/searchIndex';
import { loadRecentPages, recordRecentPage } from '../lib/recentPages';
import type { RecentPage } from '../lib/recentPages';
import { sendPetCommand } from '../lib/petBus';
import { useIsClient } from '../lib/useIsClient';
import { siteConfig } from '../siteConfig';

type View = 'search' | 'effects' | 'ambient' | 'omikuji';

interface Item {
  id: string;
  group: string;
  title: string;
  meta?: string;
  keywords?: string;
  Icon: LucideIcon;
  run: () => void;
}

const VIEW_TITLES: Record<Exclude<View, 'search'>, string> = { effects: '特效档位', ambient: '白噪音', omikuji: '今日御神签' };
const GROUP_LIMIT = 6;
const RECENT_DELAY = 500;

let indexPromise: Promise<SearchIndex> | null = null;
function loadIndex(): Promise<SearchIndex> {
  indexPromise ??= fetch(SEARCH_INDEX_URL)
    .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : Promise.reject(new Error(String(r.status)))))
    .catch((error) => {
      indexPromise = null;
      throw error;
    });
  return indexPromise;
}

/** 所有关键词都要出现；标题开头命中 > 标题包含 > 其他字段 */
function score(item: Item, terms: string[]): number {
  const title = item.title.toLowerCase();
  const rest = `${item.meta ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.startsWith(term)) total += 3;
    else if (title.includes(term)) total += 2;
    else if (rest.includes(term)) total += 1;
    else return 0;
  }
  return total;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export default function CommandPalette() {
  const mounted = useIsClient();
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const music = useMusic();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [recent, setRecent] = useState<RecentPage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    setOpen(true);
    setView('search');
    setQuery('');
    setActive(0);
    setRecent(loadRecentPages());
    loadIndex().then(setIndex, () => setIndexError(true));
  }, []);
  const close = useCallback(() => setOpen(false), []);

  // 快捷键：⌘K / Ctrl+K 开关；不在输入框里时按 / 打开
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else show();
      } else if (e.key === '/' && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
    };
  }, [open, show, close]);

  // 记录最近看过：等新页面的标题更新后再记
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const title = document.title.split(' | ')[0].trim();
      if (title) recordRecentPage({ href: window.location.pathname, title });
    }, RECENT_DELAY);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // 打开时锁住背后的页面滚动；Esc 在全局监听（工具视图里焦点可能不在面板内）：先退回搜索，再关闭
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (view !== 'search') setView('search');
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, view, close]);

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1400);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      if (href !== window.location.pathname) router.push(href);
    },
    [close, router],
  );

  const items = useMemo<Item[]>(() => {
    // 面板关着时不用算（播放音乐时进度每秒更新好几次，会带着这里重渲染）
    if (!open) return [];
    const actions: Item[] = [
      {
        id: 'theme', group: '操作', title: isDark ? '切换到日间模式' : '切换到夜间模式', keywords: '主题 深色 浅色 日夜 dark light theme',
        Icon: isDark ? Sun : Moon,
        run: () => {
          close();
          window.setTimeout(() => toggleTheme(), 120);
        },
      },
      ...(music.playlist.length > 0
        ? [
            {
              id: 'music-toggle', group: '操作', title: music.isPlaying ? '暂停音乐' : '播放音乐', meta: music.currentSong?.title,
              keywords: 'music 歌 播放 暂停', Icon: music.isPlaying ? Pause : Play,
              run: () => {
                music.togglePlay();
                close();
              },
            },
            {
              id: 'music-next', group: '操作', title: '下一首', keywords: 'music next 歌 切歌', Icon: SkipForward,
              run: () => {
                music.nextSong();
                close();
              },
            },
          ]
        : []),
      { id: 'ambient', group: '操作', title: '白噪音', meta: '雨声、海浪、篝火……', keywords: 'ambient noise 雨 海 火 专注 睡眠', Icon: AudioWaveform, run: () => setView('ambient') },
      { id: 'omikuji', group: '操作', title: '今日御神签', meta: '每天一支', keywords: '抽签 运势 omikuji', Icon: Sparkles, run: () => setView('omikuji') },
      { id: 'effects', group: '操作', title: '特效档位', meta: '完整 / 简洁 / 阅读', keywords: '樱花 弹幕 动画 卡 性能 effects', Icon: Compass, run: () => setView('effects') },
      {
        id: 'random', group: '操作', title: '随机看一篇文章', keywords: 'random 随机 漫游', Icon: Dices,
        run: () => {
          const posts = index?.posts ?? [];
          if (posts.length === 0) return flash('还没有文章');
          go(posts[Math.floor(Math.random() * posts.length)].href);
        },
      },
      {
        id: 'copy', group: '操作', title: '复制当前页面链接', keywords: 'copy link url 分享', Icon: Link2,
        run: () => {
          void navigator.clipboard.writeText(window.location.href).then(() => flash('链接已复制'), () => flash('复制失败'));
        },
      },
      {
        id: 'top', group: '操作', title: '回到顶部', keywords: 'top scroll 顶部', Icon: ArrowUp,
        run: () => {
          close();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
      ...(siteConfig.enablePet
        ? [{ id: 'pet', group: '操作', title: '召回桌宠', keywords: 'pet saber 桌宠 找不到', Icon: PawPrint, run: () => { sendPetCommand({ type: 'recall' }); close(); } }]
        : []),
    ];

    const pages: Item[] = ALL_NAV_LINKS.map((link) => ({
      id: `page:${link.href}`, group: '页面', title: link.name, meta: link.href, Icon: FileText, run: () => go(link.href),
    }));

    const fromIndex = (entries: SearchEntry[] | undefined, group: string, Icon: LucideIcon): Item[] =>
      (entries ?? []).map((e) => ({ id: `${group}:${e.href}:${e.title}`, group, title: e.title, meta: e.meta, keywords: e.keywords, Icon, run: () => go(e.href) }));

    return [
      ...actions,
      ...pages,
      ...fromIndex(index?.posts, '文章', BookOpen),
      ...fromIndex(index?.chatters, '杂谈', MessageSquareText),
      ...fromIndex(index?.books, '书架', BookOpen),
      ...fromIndex(index?.anime, '追番', Clapperboard),
    ];
  }, [open, isDark, toggleTheme, music, index, close, go, flash]);

  const results = useMemo<Item[]>(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      const recentItems: Item[] = recent
        .filter((p) => p.href !== pathname)
        .slice(0, 4)
        .map((p) => ({ id: `recent:${p.href}`, group: '最近看过', title: p.title, meta: decodeURI(p.href), Icon: Clock, run: () => go(p.href) }));
      const latest = items.filter((i) => i.group === '文章').slice(0, 3);
      return [...recentItems, ...items.filter((i) => i.group === '操作'), ...latest];
    }
    const perGroup = new Map<string, number>();
    return items
      .map((item, order) => ({ item, order, s: score(item, terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.order - b.order)
      .filter(({ item }) => {
        const n = perGroup.get(item.group) ?? 0;
        perGroup.set(item.group, n + 1);
        return n < GROUP_LIMIT;
      })
      // 排完序再按分组归拢，分组顺序沿用各组最高分出现的先后
      .reduce<Item[][]>((groups, { item }) => {
        const g = groups.find((list) => list[0].group === item.group);
        if (g) g.push(item);
        else groups.push([item]);
        return groups;
      }, [])
      .flat();
  }, [items, query, recent, pathname, go]);

  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  // 键盘选中的那一项保持在可见范围内
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onInputKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[activeIndex]?.run();
    }
  };

  if (!mounted) return null;

  const list: ReactNode[] = results.map((item, i) => {
    const header = i === 0 || results[i - 1].group !== item.group ? (
      <div key={`h:${item.group}`} className="px-3 pb-1 pt-3 text-[11px] font-black tracking-widest text-slate-400">{item.group}</div>
    ) : null;
    const selected = i === activeIndex;
    return [
      header,
      <button
        key={item.id}
        type="button"
        role="option"
        id={`cmd-${i}`}
        data-index={i}
        aria-selected={selected}
        onMouseMove={() => setActive(i)}
        onClick={() => item.run()}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? 'bg-indigo-500 text-white' : 'text-slate-700 dark:text-slate-200'}`}
      >
        <item.Icon size={17} className={`shrink-0 ${selected ? 'text-white' : 'text-slate-400'}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{item.title}</span>
        {item.meta && <span className={`max-w-[45%] shrink-0 truncate text-xs ${selected ? 'text-white/75' : 'text-slate-400'}`}>{item.meta}</span>}
        {selected && <CornerDownLeft size={14} className="shrink-0 text-white/80" />}
      </button>,
    ];
  });

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette"
          className="fixed inset-0 z-[10001] flex items-start justify-center bg-slate-900/40 px-3 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="搜索与命令"
            className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/90 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/90"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 30 } }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
          >
            {view === 'search' ? (
              <>
                <div className="flex items-center gap-3 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
                  <Search size={18} className="shrink-0 text-slate-400" />
                  <input
                    ref={inputRef}
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onInputKey}
                    placeholder="搜文章、杂谈、书架、追番，或输入命令……"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="cmd-list"
                    aria-activedescendant={results.length > 0 ? `cmd-${activeIndex}` : undefined}
                    className="w-full bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                  />
                  <kbd className="hidden shrink-0 rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300 sm:block">Esc</kbd>
                </div>
                <div ref={listRef} id="cmd-list" role="listbox" aria-label="结果" className="overflow-y-auto overscroll-contain p-2">
                  {list}
                  {results.length === 0 && (
                    <p className="px-3 py-10 text-center text-sm text-slate-400">
                      {indexError ? '搜索数据加载失败，请稍后再试' : index ? '没有找到相关内容' : '加载中……'}
                    </p>
                  )}
                </div>
                <div className="hidden items-center gap-4 border-t border-slate-200/70 px-4 py-2 text-[11px] text-slate-400 dark:border-white/10 sm:flex">
                  <span><b>↑↓</b> 选择</span>
                  <span><b>回车</b> 打开</span>
                  <span><b>Esc</b> 关闭</span>
                  <span className="ml-auto flex items-center gap-1"><Music size={11} /> 不在输入框时按 <b>/</b> 也能打开</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-slate-200/70 px-3 py-2.5 dark:border-white/10">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setView('search')}
                    aria-label="返回"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-500/10"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">{VIEW_TITLES[view]}</h2>
                </div>
                <div className="overflow-y-auto overscroll-contain p-4">
                  {view === 'effects' && <EffectsTool />}
                  {view === 'ambient' && <AmbientTool />}
                  {view === 'omikuji' && <OmikujiTool />}
                </div>
              </>
            )}

            <AnimatePresence>
              {toast && (
                <motion.div
                  role="status"
                  className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/85 px-4 py-1.5 text-xs font-bold text-white"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {toast}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
