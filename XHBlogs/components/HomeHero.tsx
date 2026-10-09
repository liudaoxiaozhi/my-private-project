"use client";
// components/HomeHero.tsx —— 首页开场：一屏高的渐变大标题 + 终端打字效果（siteConfig.homeHero）
//
// - 标题是静止的全息渐变，进场时扫一遍光（globals.css 的 .holo-text）
// - 终端行等开屏动画结束后才开始打字；「阅读」档、系统开了「减少动态效果」时直接显示全文
// - 最下面的「往下滚」提示点了滚到卡片区（#home-main）
import { useEffect, useState, useSyncExternalStore } from 'react';
import { siteConfig } from '../siteConfig';
import { useEffectsLevel } from './EffectGate';

const hero = siteConfig.homeHero;

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

export default function HomeHero() {
  const level = useEffectsLevel();
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
  const { typed, done } = useTyping(hero.command, level === 'off' || reduced);

  const scrollDown = () => {
    document.getElementById('home-main')?.scrollIntoView({ behavior: level === 'off' ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-4 text-center" aria-label="开场">
      <p className="glass-chip font-lab mb-5 px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-pink-600 dark:text-pink-300">
        {siteConfig.navTitle} {siteConfig.navSuffix} {siteConfig.navAfter}
      </p>

      <h1 className="holo-text font-lab text-[clamp(3rem,11vw,8.5rem)] font-black leading-[1.05] tracking-tight">{hero.title}</h1>

      <div className="glass-panel font-lab mt-10 inline-flex max-w-full flex-col items-start gap-1 rounded-2xl px-5 py-3 text-left text-sm sm:text-base">
        <p className="whitespace-pre-wrap break-all text-slate-700 dark:text-slate-200">
          <span className="text-pink-500 dark:text-pink-300">{hero.prompt}</span>{' '}
          <span id="hero-command">{typed}</span>
          {!done && <span className="term-caret text-pink-400" aria-hidden="true" />}
        </p>
        <p
          className={`text-xs text-slate-500 transition-opacity duration-700 sm:text-sm dark:text-slate-400 ${done ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={!done}
        >
          <span className="text-emerald-500 dark:text-emerald-300">✓</span> {hero.output}
          {done && <span className="term-caret ml-1 text-pink-400" aria-hidden="true" />}
        </p>
      </div>

      <button
        type="button"
        onClick={scrollDown}
        className="font-lab absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-xs tracking-widest text-slate-600 transition-colors hover:text-pink-500 sm:text-sm dark:text-slate-300 dark:hover:text-pink-300"
      >
        {hero.scrollPrompt} <span className="scroll-nudge inline-block text-pink-500 dark:text-pink-300">&gt;&gt;&gt;</span>
      </button>
    </section>
  );
}
