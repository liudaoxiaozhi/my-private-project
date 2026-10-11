"use client";
// components/HomeHero.tsx —— 首页开场：一屏高的渐变大标题 + 终端打字效果（siteConfig.homeHero）
//
// - 标题是静止的全息渐变，进场时扫一遍光（globals.css 的 .holo-text）
// - 终端行等开屏动画结束后才开始打字；「阅读」档、系统开了「减少动态效果」时直接显示全文
// - 最下面的「往下滚」提示点了滚到卡片区（#home-main）
// - 背景飘弹幕（components/HeroDanmaku.tsx，siteConfig.enableDanmaku）
// - 可选的「镜头蒙太奇」（components/HeroMontage.tsx，homeHero.montage，默认关）：
//   「完整」档滚动推进几组镜头再进入正文，「简洁」档只在标题后面自动换图；「阅读」档、减少动态效果时和关掉时完全一样
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { siteConfig } from '../siteConfig';
import { useEffectsLevel } from './EffectGate';
import HeroDanmaku from './HeroDanmaku';
import HeroMontage, { getMontageImages } from './HeroMontage';
import type { MontageMode } from './HeroMontage';

const hero = siteConfig.homeHero;
/** 蒙太奇的镜头（没开时为空，组件不挂载） */
const montageImages = hero.montage === true ? getMontageImages() : [];

const TYPE_MS = 110;
const START_DELAY_MS = 700;

/** 开屏动画（SplashScreen）结束时 <html> 会加上 splash-seen */
function whenSplashDone(callback: () => void): () => void {
  const root = document.documentElement;
  if (root.classList.contains('splash-seen')) {
    callback();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (root.classList.contains('splash-seen')) {
      observer.disconnect();
      callback();
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function useTyping(text: string, instant: boolean): { typed: string; done: boolean } {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (instant) return;
    const chars = [...text];
    let timer = 0;
    const step = (n: number) => {
      setCount(n);
      if (n < chars.length) timer = window.setTimeout(() => step(n + 1), TYPE_MS * (0.6 + Math.random() * 0.8));
    };
    const stop = whenSplashDone(() => {
      timer = window.setTimeout(() => step(1), START_DELAY_MS);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [text, instant]);
  const chars = [...text];
  const shown = instant ? chars.length : count;
  return { typed: chars.slice(0, shown).join(''), done: shown >= chars.length };
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReduced(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** danmaku：弹幕文字（siteConfig.danmakuList + 最新文章标题，由首页传进来） */
export default function HomeHero({ danmaku = [] }: { danmaku?: string[] }) {
  const level = useEffectsLevel();
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
  const { typed, done } = useTyping(hero.command, level === 'off' || reduced);
  const sceneRef = useRef<HTMLElement>(null);
  // 没开蒙太奇 / 「阅读」档 / 减少动态效果：null，开场和原来一模一样
  const montage: MontageMode | null = montageImages.length > 0 && level !== 'off' && !reduced ? level : null;

  const scrollDown = () => {
    document.getElementById('home-main')?.scrollIntoView({ behavior: level === 'off' ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section ref={sceneRef} data-montage={montage ?? undefined} className="relative flex min-h-[100svh] flex-col items-center justify-center px-4 text-center" aria-label="开场">
      {/* 蒙太奇的镜头层在最下面；「完整」档的黑边、计数器和按钮浮在最上面（z-index） */}
      {montage && <HeroMontage mode={montage} images={montageImages} sceneRef={sceneRef} waitForSplash={whenSplashDone} />}
      {/* 暗色径向遮罩在弹幕和标题下面：只压中间，让标题和终端从插画里浮出来 */}
      <div className="hero-veil" aria-hidden="true" />
      {siteConfig.enableDanmaku && level !== 'off' && !reduced && <HeroDanmaku texts={danmaku} lite={level === 'lite'} />}

      <p className="glass-chip font-lab relative mb-5 px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-pink-600 dark:text-pink-300">
        {siteConfig.navTitle} {siteConfig.navSuffix} {siteConfig.navAfter}
      </p>

      <h1 className="holo-text font-lab relative text-[clamp(3rem,11vw,8.5rem)] font-black leading-[1.05] tracking-tight" data-montage-title={montage === 'full' ? hero.title : undefined}>{hero.title}</h1>

      {/* 终端窗口：配色只用标题里的粉、紫、天蓝 */}
      <div className="hero-terminal font-lab relative mt-10 inline-flex max-w-full flex-col items-start gap-1 rounded-2xl px-5 pb-3 pt-2.5 text-left text-sm sm:text-base">
        <span className="mb-1 flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-[#ff8fc4]/80" />
          <span className="h-2 w-2 rounded-full bg-[#c6a2ff]/80" />
          <span className="h-2 w-2 rounded-full bg-[#8fd0ff]/80" />
        </span>
        <p className="whitespace-pre-wrap break-all text-slate-100">
          <span className="text-[#ff8fc4]">{hero.prompt}</span>{' '}
          <span id="hero-command">{typed}</span>
          {!done && <span className="term-caret text-[#ff8fc4]" aria-hidden="true" />}
        </p>
        <p className={`text-xs text-slate-300 transition-opacity duration-700 sm:text-sm ${done ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!done}>
          <span className="text-[#8fd0ff]">✓</span> {hero.output}
          {done && <span className="term-caret ml-1 text-[#ff8fc4]" aria-hidden="true" />}
        </p>
      </div>

      {/* 「完整」档的蒙太奇有自己的「进入正文 ↓」 */}
      {montage !== 'full' && (
        <button
          type="button"
          onClick={scrollDown}
          className="font-lab absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/30 px-4 py-2 text-xs tracking-widest text-slate-100 backdrop-blur-sm transition-colors hover:text-[#ff8fc4] sm:text-sm"
        >
          {hero.scrollPrompt} <span className="scroll-nudge inline-block text-[#ff8fc4]">&gt;&gt;&gt;</span>
        </button>
      )}
    </section>
  );
}
