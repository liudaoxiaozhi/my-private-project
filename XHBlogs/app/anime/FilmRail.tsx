'use client';
// app/anime/FilmRail.tsx —— 追番页「放映厅」：把电影与电视剧排成一条横向胶片
//
// 两种模式，写在 section[data-mode] 上：
// - native：普通的横向滚动条带（scroll-snap、隐藏滚动条，Shift + 滚轮原生可横滚）。
//   服务端渲染和首次 Hydration 一律是它，不会出现水合前后布局不一致。
// - pinned：挂载后满足「特效完整档 + 精确指针 + 视口 ≥ 768px + 未开减少动态效果 + 至少 4 部」才切换：
//   区块拉长成「跑道」（舞台高度 + 横向行程），舞台 sticky 固定在视口里，竖向滚动换算成胶片横移；
//   离舞台中线最近的一格写上 data-active 并放大，其余稍暗。每帧最多读一次位置、写一次 transform。
//
// 技术参考：yuimi-chaya 主题 fuyukawa-kagari 的 src/themes/fuyukawa-kagari/lib/manga-runtime.mjs
// （mountChapterRail，MIT 许可）——只借鉴「竖滚驱动横向轨道」的做法，没有使用其代码素材。
//
// 每格是一个按钮（可访问名称 = 标题），打开和卡片一样的详情 / 编辑弹窗；聚焦在胶片上时 ←/→（Home/End）切换格子。
import { useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import { Film } from 'lucide-react';
import { useEffectsLevel } from '../../components/EffectGate';
import { KIND_LABEL, STATUS_LABEL, type AnimeEntry } from '../../lib/anime';
import { AnimeCover } from './AnimeCard';
import './film.css';

/** 至少几部才启用竖滚驱动的横移（太少没有横移的必要） */
const MIN_PINNED = 4;
/** 精确指针、宽屏、够高（舞台要放得下）、未开减少动态效果 */
const PIN_QUERY = '(pointer: fine) and (min-width: 768px) and (min-height: 520px) and (prefers-reduced-motion: no-preference)';
/** 舞台 sticky 时离视口顶部至少留出导航栏的高度（h-16 + 余量） */
const NAV_CLEARANCE = 76;
const EDGE_GAP = 8;

function subscribePinQuery(onChange: () => void): () => void {
  const mq = window.matchMedia(PIN_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
const readPinQuery = (): boolean => window.matchMedia(PIN_QUERY).matches;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 胶片边上的片号：01A、02A… */
const frameCode = (index: number): string => `${String(index + 1).padStart(2, '0')}A`;

/**
 * pinned 模式的运行时：只写 DOM（CSS 变量、transform、data-active），不碰 React 状态。
 * 返回清理函数，退出 pinned 模式时把写过的东西全部撤掉。
 */
function mountPinnedRail(section: HTMLElement, stage: HTMLElement, view: HTMLElement, track: HTMLElement): () => void {
  const frames = Array.from(track.querySelectorAll<HTMLElement>('[data-film-frame]'));
  if (frames.length === 0) return () => {};

  /** 各格中心相对胶片左端的位置（offsetLeft 不受 transform 影响） */
  let centers: number[] = [];
  let travel = 0;
  let stickyTop = NAV_CLEARANCE;
  let raf = 0;
  let active = -1;
  let shown = Number.NaN;

  const setActive = (index: number) => {
    if (index === active) return;
    frames[active]?.removeAttribute('data-active');
    frames[index]?.setAttribute('data-active', '');
    active = index;
  };

  const paint = () => {
    raf = 0;
    // 舞台被 sticky 钉住后，它相对区块顶部的位移就是已经滚过的距离
    const progress = clamp(stage.getBoundingClientRect().top - section.getBoundingClientRect().top, 0, travel);
    const rounded = Math.round(progress * 10) / 10;
    if (rounded !== shown) {
      shown = rounded;
      track.style.transform = `translate3d(${-rounded}px, 0, 0)`;
    }
    const target = centers[0] + progress;
    let best = 0;
    for (let i = 1; i < centers.length; i++) {
      if (Math.abs(centers[i] - target) < Math.abs(centers[best] - target)) best = i;
    }
    setActive(best);
  };

  const schedule = () => {
    if (!raf) raf = window.requestAnimationFrame(paint);
  };

  const measure = () => {
    // 前后留出「片头 / 片尾」，让第一格和最后一格都能走到舞台中线
    const lead = Math.max(12, Math.round((view.clientWidth - frames[0].offsetWidth) / 2));
    track.style.setProperty('--film-lead', `${lead}px`);
    centers = frames.map((frame) => frame.offsetLeft + frame.offsetWidth / 2);
    travel = Math.max(0, centers[centers.length - 1] - centers[0]);

    const stageHeight = stage.offsetHeight;
    const room = window.innerHeight - stageHeight;
    // 尽量竖直居中；空间不够时贴近顶部，但别让舞台底部掉出视口
    stickyTop = Math.round(Math.max(EDGE_GAP, Math.min(Math.max(NAV_CLEARANCE, room / 2), room - EDGE_GAP)));
    section.style.setProperty('--film-top', `${stickyTop}px`);
    section.style.setProperty('--film-runway', `${Math.round(stageHeight + travel)}px`);

    window.cancelAnimationFrame(raf);
    shown = Number.NaN;
    paint();
  };

  // 键盘（Tab / 方向键）把焦点移到某一格时，滚到让这一格停在舞台中线的位置；鼠标点击不跟着滚
  const onFocusIn = (event: FocusEvent) => {
    const index = frames.indexOf(event.target as HTMLElement);
    if (index < 0 || !frames[index].matches(':focus-visible')) return;
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: sectionTop - stickyTop + (centers[index] - centers[0]), behavior: 'smooth' });
  };

  const observer = new ResizeObserver(() => measure());
  observer.observe(view);
  observer.observe(stage);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  track.addEventListener('focusin', onFocusIn);
  measure();

  return () => {
    window.cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', measure);
    track.removeEventListener('focusin', onFocusIn);
    for (const frame of frames) frame.removeAttribute('data-active');
    track.style.transform = '';
    track.style.removeProperty('--film-lead');
    section.style.removeProperty('--film-top');
    section.style.removeProperty('--film-runway');
  };
}

interface FilmRailProps {
  /** 当前筛选结果里的电影与电视剧 */
  entries: AnimeEntry[];
  onOpen: (entry: AnimeEntry) => void;
}

export default function FilmRail({ entries, onOpen }: FilmRailProps) {
  const idPrefix = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);

  const level = useEffectsLevel();
  // 服务端快照为 false：先渲染 native，挂载后再按真实环境切换
  const canPin = useSyncExternalStore(subscribePinQuery, readPinQuery, () => false);
  const pinned = canPin && level === 'full' && entries.length >= MIN_PINNED;
  // 条目增减 / 换序时重新挂载运行时
  const idsKey = entries.map((e) => e.id).join('|');

  // 布局效果：切到 pinned 的那一帧绘制前就量好跑道高度，避免先闪一下未钉住的样子
  useLayoutEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const view = viewRef.current;
    const track = trackRef.current;
    if (!pinned || !section || !stage || !view || !track) return;
    return mountPinnedRail(section, stage, view, track);
  }, [pinned, idsKey]);

  if (entries.length === 0) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const frames = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-film-frame]'));
    const index = frames.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    let next: number;
    if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = frames.length - 1;
    else return;
    event.preventDefault();
    const target = frames[clamp(next, 0, frames.length - 1)];
    // pinned 时由运行时把窗口滚到对应位置；native 时只在条带里横向挪到可见
    target.focus({ preventScroll: true });
    if (!pinned) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <section ref={sectionRef} aria-label="放映厅" className="film" data-mode={pinned ? 'pinned' : 'native'}>
      <div ref={stageRef} className="film-stage">
        <div className="film-head">
          <h2 className="film-heading">
            <Film size={15} aria-hidden="true" className="text-indigo-500 dark:text-indigo-400" />
            放映厅 · 电影与剧集
          </h2>
          <span className="film-count">{entries.length} 部</span>
        </div>

        <div ref={viewRef} className="film-view">
          <ol ref={trackRef} className="film-track" onKeyDown={onKeyDown}>
            {entries.map((entry, index) => {
              const metaId = `${idPrefix}-meta-${index}`;
              const meta = [entry.airDate.slice(0, 4), KIND_LABEL[entry.kind], STATUS_LABEL[entry.status]].filter(Boolean).join(' · ');
              return (
                <li key={entry.id} className="film-cell">
                  <button
                    type="button"
                    className="film-frame"
                    data-film-frame
                    aria-label={entry.title}
                    aria-describedby={metaId}
                    onClick={() => onOpen(entry)}
                  >
                    <AnimeCover entry={entry} sizes="(min-width: 768px) 172px, 128px" className="film-cover" />
                    <span className="film-caption">
                      <span className="film-title">{entry.title}</span>
                      <span id={metaId} className="film-meta">
                        {meta}
                      </span>
                    </span>
                    <span className="film-leak" aria-hidden="true" />
                    <span className="film-code" aria-hidden="true">
                      {frameCode(index)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
