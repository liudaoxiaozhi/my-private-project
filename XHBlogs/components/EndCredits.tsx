'use client';
// components/EndCredits.tsx —— 首页最底下的「片尾字幕」：像电影散场那样，把今年写过的文章、看过的片子滚一遍
//
// 三种呈现（data-credits-state，样式与滚动动画都在 end-credits.css）：
//   static ：服务端渲染 / 没有 JS / 「阅读」档（含系统减少动态）—— 全部字幕静止排在一个可滚动的面板里，末尾是「感谢观看」
//   idle → rolling ：「完整」「简洁」档，面板露出一半以上时字幕匀速上滚（每个浏览器会话只自动播一次，sessionStorage）
//   done   ：滚完或点「跳过」后，只留「感谢观看」卡片和「重播」按钮
// 鼠标在面板里移动、或键盘焦点落在字幕里的链接上时暂停；标签页切到后台、面板整个滚出视口时也暂停。
// 文章标题故意是纯文本不是链接：首页 e2e 会点「最后一个 a[href^="/posts/"]」测封面过渡，这里不能抢到它。

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AnimationEvent, CSSProperties, FocusEvent, PointerEvent } from 'react';
import { useEffectsLevel } from './EffectGate';
import './end-credits.css';

export interface CreditPost {
  title: string;
  /** 展示用日期，如 "10.03"（近期出品时带年份 "2025.10.03"） */
  date: string;
}

export interface CreditWatch {
  title: string;
  /** 番剧 / 电影 / 电视剧 */
  kind: string;
}

export interface EndCreditsProps {
  year: string;
  siteTitle: string;
  author: string;
  /** year：本年度的文章；recent：今年还没写，用最近几篇顶上 */
  postsScope: 'year' | 'recent';
  posts: CreditPost[];
  /** 列表被截断时省略掉的篇数 */
  morePosts: number;
  /** year：今年看完的；recent：最近看完的；watching：还没看完任何一部，列正在看的 */
  watchScope: 'year' | 'recent' | 'watching';
  watched: CreditWatch[];
  moreWatched: number;
}

type Phase = 'idle' | 'rolling' | 'done';
type CreditsState = 'static' | Phase;

const PLAYED_KEY = 'credits-played';
/** 每行字幕停留的秒数，以及整卷时长的上下限 */
const SECONDS_PER_LINE = 1.6;
const MIN_SECONDS = 18;
const MAX_SECONDS = 45;
/** 字幕卷开场时的位置（视口高度的比例），与 end-credits.css 里的 --credits-start: 60cqh 保持一致 */
const START_RATIO = 0.6;

const WATCH_NOTE: Record<EndCreditsProps['watchScope'], string> = {
  year: '',
  recent: '最近看完',
  watching: '正在追',
};

// —— 外部状态：本会话是否播过、标签页是否在后台（useSyncExternalStore，免得在 effect 里同步 setState）——

const noopSubscribe = () => () => {};

function readPlayed(): boolean {
  try {
    return sessionStorage.getItem(PLAYED_KEY) === '1';
  } catch {
    return false;
  }
}

function markPlayed(): void {
  try {
    sessionStorage.setItem(PLAYED_KEY, '1');
  } catch {
    /* 存储不可用：下次进首页再播一遍也无妨 */
  }
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

const isDocumentHidden = () => document.visibilityState === 'hidden';

function CreditLine({ role, name }: { role: string; name: string }) {
  return (
    <p className="end-credits__line">
      <span className="end-credits__role">{role}</span>
      <span className="end-credits__name">{name}</span>
    </p>
  );
}

export default function EndCredits({
  year, siteTitle, author, postsScope, posts, morePosts, watchScope, watched, moreWatched,
}: EndCreditsProps) {
  const level = useEffectsLevel();
  // 服务端与首次 Hydration 时为 null —— 此时一律按 static 渲染，和服务端 HTML 一致
  const played = useSyncExternalStore<boolean | null>(noopSubscribe, readPlayed, () => null);
  const hidden = useSyncExternalStore(subscribeVisibility, isDocumentHidden, () => false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [run, setRun] = useState(0);
  const [outOfView, setOutOfView] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<'skip' | 'replay' | null>(null);

  const motion = played !== null && level !== 'off';
  const state: CreditsState = !motion ? 'static' : phase === 'idle' && played ? 'done' : phase;
  const paused = state === 'rolling' && (hidden || outOfView || hoverPaused);

  // 露出一半以上开始滚；滚动途中整个滚出视口就先停下
  useEffect(() => {
    if (state !== 'idle' && state !== 'rolling') return;
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.intersectionRatio >= 0.5) {
        setOutOfView(false);
        if (state === 'idle') {
          markPlayed();
          setPhase('rolling');
        }
      } else if (!entry.isIntersecting) {
        setOutOfView(true);
      }
    }, { threshold: [0, 0.5] });
    io.observe(el);
    return () => io.disconnect();
  }, [state]);

  const lineCount =
    3 + 2 // 片名卡 + 出品 / 脚本
    + 2 + posts.length + (morePosts > 0 ? 1 : 0) + 1
    + (watched.length > 0 ? 2 + watched.length + (moreWatched > 0 ? 1 : 0) + 1 : 0)
    + 2 + 2; // 幕后 + 特别鸣谢
  const duration = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, lineCount * SECONDS_PER_LINE));

  const finish = () => {
    const active = document.activeElement;
    if (active && sectionRef.current?.contains(active)) focusNext.current = 'replay';
    markPlayed();
    setHoverPaused(false);
    setPhase('done');
  };

  const replay = () => {
    focusNext.current = 'skip';
    setRun((n) => n + 1);
    setHoverPaused(false);
    setOutOfView(false);
    setPhase('rolling');
  };

  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) finish();
  };

  // 只有鼠标真的在面板里动了才暂停：滚轮滚到这里时光标恰好停在面板上，不该一出场就卡住
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && !hoverPaused) setHoverPaused(true);
  };
  const onPointerLeave = () => {
    if (hoverPaused) setHoverPaused(false);
  };

  // 键盘焦点落到字幕里的链接上：CSS 会暂停动画（:focus-within），这里再把那一行挪到面板中间，免得焦点落在看不见的地方
  // idle 时动画已挂上、停在第 0 帧，同样可以挪
  const onReelFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (state !== 'rolling' && state !== 'idle') return;
    const reel = e.currentTarget;
    const viewport = viewportRef.current;
    const anim = reel.getAnimations().find((a) => a instanceof CSSAnimation);
    if (!viewport || !anim) return;
    const vp = viewport.getBoundingClientRect();
    const target = (e.target as HTMLElement).getBoundingClientRect();
    const margin = vp.height * 0.2; // 上下渐隐区之外才算看得清
    if (target.top >= vp.top + margin && target.bottom <= vp.bottom - margin) return;
    const reelBox = reel.getBoundingClientRect();
    const total = Number(anim.effect?.getComputedTiming().duration);
    if (!Number.isFinite(total) || total <= 0) return;
    // 平移量随时间线性变化：start = 0.6 × 视口高，end = −整卷高
    const start = vp.height * START_RATIO;
    const end = -reelBox.height;
    const wanted = vp.height / 2 - target.height / 2 - (target.top - reelBox.top);
    const progress = Math.min(1, Math.max(0, (wanted - start) / (end - start)));
    anim.currentTime = progress * total;
  };

  const skipRef = (el: HTMLButtonElement | null) => {
    if (el && focusNext.current === 'skip') {
      focusNext.current = null;
      el.focus({ preventScroll: true });
    }
  };
  const replayRef = (el: HTMLButtonElement | null) => {
    if (el && focusNext.current === 'replay') {
      focusNext.current = null;
      el.focus({ preventScroll: true });
    }
  };

  const style = { '--credits-duration': `${duration}s` } as CSSProperties;
  const watchNote = WATCH_NOTE[watchScope];

  return (
    <section
      ref={sectionRef}
      aria-label="片尾字幕"
      className="end-credits"
      data-credits-state={state}
      data-credits-paused={paused ? '' : undefined}
      style={style}
    >
      <h2 className="end-credits__badge">片尾字幕<span aria-hidden="true"> · End Credits</span></h2>

      {(state === 'idle' || state === 'rolling') && (
        <button ref={skipRef} type="button" className="end-credits__button end-credits__skip" onClick={finish}>
          跳过
        </button>
      )}

      <div
        ref={viewportRef}
        className="end-credits__viewport"
        tabIndex={state === 'static' ? 0 : undefined}
        onPointerMove={state === 'rolling' ? onPointerMove : undefined}
        onPointerLeave={state === 'rolling' ? onPointerLeave : undefined}
      >
        <div
          key={run}
          className="end-credits__reel"
          aria-hidden={state === 'done' ? true : undefined}
          onAnimationEnd={onAnimationEnd}
          onFocus={onReelFocus}
        >
          <div className="end-credits__title-card">
            <p className="end-credits__eyebrow">{year} · 年度放映</p>
            <p className="end-credits__title">{siteTitle}</p>
          </div>

          <div className="end-credits__block">
            <CreditLine role="出品" name={siteTitle} />
            <CreditLine role="脚本" name={author} />
          </div>

          <div className="end-credits__block">
            <h3 className="end-credits__heading">{postsScope === 'year' ? '本年度出品' : '近期出品'}</h3>
            {posts.length > 0 ? (
              posts.map((post, i) => <CreditLine key={`${post.title}-${i}`} role={post.date} name={post.title} />)
            ) : (
              <p className="end-credits__note">暂无作品，敬请期待</p>
            )}
            {morePosts > 0 && <p className="end-credits__note">以及另外 {morePosts} 篇</p>}
            <p className="end-credits__more">
              <Link href="/timeline" className="end-credits__link">全部文章 →</Link>
            </p>
          </div>

          {watched.length > 0 && (
            <div className="end-credits__block">
              <h3 className="end-credits__heading">观影记录</h3>
              {watchNote && <p className="end-credits__note">{watchNote}</p>}
              {watched.map((item, i) => <CreditLine key={`${item.title}-${i}`} role={item.kind} name={item.title} />)}
              {moreWatched > 0 && <p className="end-credits__note">以及另外 {moreWatched} 部</p>}
              <p className="end-credits__more">
                <Link href="/anime" className="end-credits__link">全部片单 →</Link>
              </p>
            </div>
          )}

          <div className="end-credits__block">
            <h3 className="end-credits__heading">幕后</h3>
            <CreditLine role="背景音乐" name="网易云音乐" />
          </div>

          <div className="end-credits__block">
            <h3 className="end-credits__heading">特别鸣谢</h3>
            <CreditLine role="观众" name="每一位来访的你" />
          </div>
        </div>

        <div className="end-credits__finale" aria-hidden={state === 'idle' || state === 'rolling' ? true : undefined}>
          <p className="end-credits__thanks">感谢观看</p>
          <p className="end-credits__signature">{siteTitle} · {year}</p>
          {state === 'done' && (
            <button ref={replayRef} type="button" className="end-credits__button end-credits__replay" onClick={replay}>
              重播
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
