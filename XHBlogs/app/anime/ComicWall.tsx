'use client';
// app/anime/ComicWall.tsx —— 追番页的「分镜」视图：把番剧排成一页漫画
//
// - 12 栏网格上按「条带」拼版：每条两行（或一行）正好铺满，在看 / 高分（≥ 8）的作品占大格，其余是小格
// - 每格是一个按钮（可访问名称 = 标题），点开和卡片视图一样的详情 / 编辑弹窗；开弹窗前沿斜线劈开
// - 入场动效见 lib/comicMotion.ts；特效档位为「阅读」（含系统减少动态效果）时一切静止
// 视图选择（卡片 / 分镜）也在这里：存在读者浏览器的 localStorage「anime-view」里
import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { LayoutDashboard, LayoutGrid } from 'lucide-react';
import { useEffectsLevel } from '../../components/EffectGate';
import { armComicReveal, playComicSplit } from '../../lib/comicMotion';
import { KIND_LABEL, STATUS_LABEL, type AnimeEntry } from '../../lib/anime';
import { AnimeCover } from './AnimeCard';
import './comic.css';

// —— 视图选择（卡片 / 分镜） ——

export type AnimeView = 'cards' | 'comic';

const VIEW_KEY = 'anime-view';
const VIEW_EVENT = 'anime-view-change';
/** 本次浏览里选过的视图：存储不可用时也能切换 */
let chosenView: AnimeView | null = null;

function readView(): AnimeView {
  if (chosenView) return chosenView;
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'comic' ? 'comic' : 'cards';
  } catch {
    return 'cards';
  }
}

function subscribeView(onChange: () => void): () => void {
  // 其他标签页切了视图：本页跟着变
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== VIEW_KEY) return;
    chosenView = null;
    onChange();
  };
  window.addEventListener(VIEW_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(VIEW_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function setAnimeView(view: AnimeView): void {
  chosenView = view;
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* 存储不可用：只在本次浏览里生效 */
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
}

/** 当前视图；服务端和首次 Hydration 时一律是「卡片」 */
export function useAnimeView(): AnimeView {
  return useSyncExternalStore(subscribeView, readView, () => 'cards');
}

const VIEW_BUTTON = 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
const VIEW_ON = 'bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900';
const VIEW_OFF = 'bg-white/60 text-slate-600 hover:bg-white/90 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/70';

/** 「卡片 / 分镜」切换，放在页头筛选行里 */
export function AnimeViewSwitch({ view }: { view: AnimeView }) {
  const options: Array<{ value: AnimeView; label: string; icon: typeof LayoutGrid }> = [
    { value: 'cards', label: '卡片', icon: LayoutGrid },
    { value: 'comic', label: '分镜', icon: LayoutDashboard },
  ];
  return (
    <div role="group" aria-label="视图" className="flex shrink-0 gap-1.5">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => setAnimeView(value)}
          className={`${VIEW_BUTTON} ${view === value ? VIEW_ON : VIEW_OFF}`}
        >
          <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

// —— 拼版 ——

/**
 * 格子尺寸（以桌面 12 栏计，B = 两行高的大格，s = 一行高的小格，sT = 两行高的小格）。
 * 窄屏（< 640px）在 comic.css 里改成 2 栏：大格 2×2，其余 1×1（s12 横跨 2 栏，sT 1×2）。
 */
type Slot = 'B6' | 'B4' | 's12' | 's6' | 's4' | 's3' | 'sT6' | 'sT4';

const isBigSlot = (slot: Slot) => slot[0] === 'B';

/**
 * 一条的排法：DOM 顺序就是网格自动排布的顺序，每条都正好铺满 12 栏，所以不会留洞。
 * 例如 ['s3','s3','B6','s3','s3']：左边上下各两小格，右边一个大格。
 */
const PREFERRED: Slot[][] = [
  ['B6', 's3', 's3', 's3', 's3'],
  ['s4', 's4', 's4'],
  ['B4', 'B4', 's4', 's4'],
  ['s3', 's3', 'B6', 's3', 's3'],
  ['s3', 's3', 's3', 's3'],
  ['B6', 'B6'],
  ['B4', 's4', 's4', 's4', 's4'],
  ['s4', 'B4', 'B4', 's4'],
  ['B6', 's3', 's3', 's6'],
  ['B4', 'B4', 'B4'],
  ['s3', 's3', 'B6', 's6'],
];
/** 上面都凑不齐时的兜底（顺序即优先级）。结尾只剩一部时用一行高的通栏（像电影宽银幕），不用两行高的通栏，免得一格占掉大半屏 */
const FALLBACK: Slot[][] = [['B6', 's6', 's6'], ['B4', 'sT4', 'B4'], ['s6', 's6'], ['B6', 'sT6']];

function composition(slots: Slot[]): [number, number] {
  const big = slots.filter(isBigSlot).length;
  return [big, slots.length - big];
}

const wantsBig = (entry: AnimeEntry) => entry.status === 'watching' || entry.rating >= 8;

interface Placed {
  entry: AnimeEntry;
  slot: Slot;
}

/**
 * 按顺序把作品装进一条条排法里：取开头 n 部，大小格数量和某种排法一致就用它。
 * 同一条里大格填大格位、小格填小格位（条内顺序会微调，条与条之间保持原排序）。
 * 首选排法按条数轮换，让页面有节奏而不是一个样。
 */
function layoutPage(entries: AnimeEntry[]): Placed[] {
  const placed: Placed[] = [];
  let start = 0;
  let strip = 0;
  const fits = (slots: Slot[]) => {
    if (start + slots.length > entries.length) return false;
    const head = entries.slice(start, start + slots.length);
    const big = head.filter(wantsBig).length;
    const [needBig, needSmall] = composition(slots);
    return big === needBig && head.length - big === needSmall;
  };
  while (start < entries.length) {
    const rotated = PREFERRED.map((_, i) => PREFERRED[(i + strip) % PREFERRED.length]);
    const slots = rotated.find(fits) ?? FALLBACK.find(fits) ?? ['s12'];
    const head = entries.slice(start, start + slots.length);
    const bigs = head.filter(wantsBig);
    const smalls = head.filter((e) => !wantsBig(e));
    for (const slot of slots) {
      // 兜底的通栏不分大小，哪边还有就用哪边，保证一部都不漏
      const entry = isBigSlot(slot) ? (bigs.shift() ?? smalls.shift()) : (smalls.shift() ?? bigs.shift());
      if (entry) placed.push({ entry, slot });
    }
    start += slots.length;
    strip += 1;
  }
  return placed;
}

const SIZES: Record<Slot, string> = {
  B6: '(min-width: 1024px) 560px, (min-width: 640px) 50vw, 92vw',
  B4: '(min-width: 1024px) 380px, (min-width: 640px) 34vw, 92vw',
  s12: '(min-width: 1024px) 1100px, 92vw',
  s6: '(min-width: 1024px) 560px, (min-width: 640px) 50vw, 46vw',
  sT6: '(min-width: 1024px) 560px, (min-width: 640px) 50vw, 46vw',
  s4: '(min-width: 1024px) 380px, (min-width: 640px) 34vw, 46vw',
  sT4: '(min-width: 1024px) 380px, (min-width: 640px) 34vw, 46vw',
  s3: '(min-width: 1024px) 280px, (min-width: 640px) 25vw, 46vw',
};

/** 按 id 算出的固定小角度（±0.6°）：每次渲染都一样，服务端和浏览器也一样 */
function tiltOf(id: string): string {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 4294967295;
  return `${((unit * 2 - 1) * 0.6).toFixed(2)}deg`;
}

// —— 分镜墙 ——

interface ComicWallProps {
  entries: AnimeEntry[];
  editable: boolean;
  onOpen: (entry: AnimeEntry) => void;
}

export default function ComicWall({ entries, editable, onOpen }: ComicWallProps) {
  const level = useEffectsLevel();
  const rootRef = useRef<HTMLElement>(null);
  const openingRef = useRef(false);
  const idPrefix = useId();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return armComicReveal(root, { panelSelector: '.comic-panel', captionSelector: '[data-comic-caption]', level });
  }, [level]);

  const open = async (entry: AnimeEntry, event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const face = button.querySelector<HTMLElement>('.comic-face');
    const still = level === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !face || typeof button.animate !== 'function') {
      onOpen(entry);
      return;
    }
    if (openingRef.current) return;
    openingRef.current = true;
    try {
      const restore = await playComicSplit(button, face);
      onOpen(entry);
      // 等弹窗盖上来再把格子拼回去
      window.setTimeout(restore, 160);
    } finally {
      openingRef.current = false;
    }
  };

  const placed = layoutPage(entries);

  return (
    <section ref={rootRef} aria-label="分镜墙" className="comic-wall">
      <div className="comic-head">
        <h2 className="comic-title">
          <span>
            第 <b>{entries.length}</b> 话 · 追番
          </span>
        </h2>
        <p className="comic-note">{editable ? '点一格编辑' : '点一格看详情'}</p>
      </div>

      <ul className="comic-grid">
        {placed.map(({ entry, slot }, index) => {
          const big = isBigSlot(slot);
          const descId = `${idPrefix}-${index}`;
          const meta = `${KIND_LABEL[entry.kind]} · ${STATUS_LABEL[entry.status]}`;
          return (
            <li
              key={entry.id}
              className="comic-panel"
              data-slot={slot}
              data-big={big ? '' : undefined}
              style={{ '--tilt': tiltOf(entry.id) } as CSSProperties}
            >
              <button
                type="button"
                className="comic-btn"
                aria-label={entry.title}
                aria-describedby={descId}
                onClick={(event) => void open(entry, event)}
              >
                <span className="comic-face">
                  <AnimeCover entry={entry} sizes={SIZES[slot]} eager={index < 4} className="comic-art" />

                  {entry.rating > 0 && (
                    <span className="comic-stamp" aria-hidden="true">
                      {entry.rating}
                      <small>分</small>
                    </span>
                  )}

                  {entry.comment && (
                    <span className="comic-bubble" aria-hidden="true">
                      <span className="comic-bubble-text">{entry.comment}</span>
                    </span>
                  )}

                  <span className="comic-caption" data-comic-caption>
                    <span className="comic-cap-title">{entry.title}</span>
                    <span id={descId} className="comic-cap-meta">
                      {meta}
                      {entry.rating > 0 && <span className="sr-only">，评分 {entry.rating}</span>}
                      {entry.comment && <span className="sr-only">，短评：{entry.comment}</span>}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
