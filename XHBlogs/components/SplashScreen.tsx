"use client";
// components/SplashScreen.tsx —— 开屏动画（幕布式）
//
// 画面分上下两块幕布：上幕布是头像、站名、简介和新加坡日期；下幕布的边缘趴着一排 Q 版角色
// （siteConfig.splashBanners，每次随机一张），角色从边缘后面探出头来。约 3 秒后上幕布上移、
// 下幕布连同角色下移，露出网站。同一标签页只播一次（sessionStorage），点击或按任意键可跳过。
// 系统开启「减少动态效果」时不做探头和拉幕，只淡入淡出。
//
// Hydration：挂载前不渲染任何内容；随机横幅和日期都只在客户端决定。
// 页面主体由 layout 里的 .splash-seen 控制显隐。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Transition, Variants } from 'framer-motion';
import { siteConfig } from '../siteConfig';
import { formatDateParts, isValidTimeZone } from '../lib/time';
import AppImage from './AppImage';
import { useReduceMotion } from './EffectGate';

interface SplashBanner {
  src: string;
  width: number;
  height: number;
  /** 角色趴着的边在图片高度中的位置（0~1） */
  edge: number;
}

type CSSVars = CSSProperties & Record<`--${string}`, string>;

const SEEN_KEY = 'hasSeenSplash';
const DURATION_MS = 3000;
const REDUCED_DURATION_MS = 1200;
const TIME_ZONE = isValidTimeZone(siteConfig.timeZone) ? siteConfig.timeZone : undefined;
const BANNERS: readonly SplashBanner[] = (siteConfig.splashBanners ?? []).filter(
  (b): b is SplashBanner => typeof b.src === 'string' && b.width > 0 && b.height > 0 && b.edge > 0 && b.edge <= 1,
);

/** 幕布接缝的位置（距顶部的比例） */
const SEAM = '64%';
const CURTAIN_EASE: Transition = { duration: 0.85, ease: [0.76, 0, 0.24, 1] };

const fade = (delay: number): Variants => ({
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
});

export default function SplashScreen() {
  const [isMounted, setIsMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [dateLine, setDateLine] = useState('');
  const [banner, setBanner] = useState<SplashBanner | null>(null);
  const reduceMotion = useReduceMotion();
  const exited = useRef(false);

  const exitSplash = useCallback(() => {
    if (exited.current) return;
    exited.current = true;
    try {
      sessionStorage.setItem(SEEN_KEY, 'true');
    } catch {
      /* 存储不可用时下次还会播放，不影响使用 */
    }
    // 幕布拉开的同时让页面主体淡入
    document.documentElement.classList.add('splash-seen');
    setShow(false);
  }, []);

  useEffect(() => {
    setIsMounted(true);
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === 'true';
    } catch {
      seen = false;
    }
    // 网页后台不播开屏动画
    if (seen || /^\/admin(\/|$)/.test(window.location.pathname)) {
      document.documentElement.classList.add('splash-seen');
      return;
    }

    const { date, weekday } = formatDateParts(new Date(), TIME_ZONE);
    setDateLine([date, weekday, TIME_ZONE ? siteConfig.timeZoneLabel || TIME_ZONE : ''].filter(Boolean).join(' · '));
    setBanner(BANNERS.length ? BANNERS[Math.floor(Math.random() * BANNERS.length)] : null);
    setShow(true);

    const timer = window.setTimeout(exitSplash, reduceMotion ? REDUCED_DURATION_MS : DURATION_MS);
    const skip = () => exitSplash();
    window.addEventListener('keydown', skip);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', skip);
    };
    // reduceMotion 只在首次进入时读取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitSplash]);

  if (!isMounted) return null;

  const titleChars = Array.from(siteConfig.title);
  const still = Boolean(reduceMotion);

  // 横幅尺寸：宽度受屏宽、上限 860px 和屏高三者约束，保证矮屏上文字也放得下
  const vars: CSSVars = banner
    ? {
        '--bw': 'min(92vw, 860px, calc(64dvh * 1.2))',
        '--bh': `calc(var(--bw) * ${banner.height / banner.width})`,
        '--above': `calc(var(--bh) * ${banner.edge})`,
        '--below': `calc(var(--bh) * ${1 - banner.edge})`,
      }
    : { '--above': '0px', '--below': '0px' };

  const curtain = (direction: -1 | 1): Variants => ({
    hidden: { y: '0%', opacity: 1 },
    shown: { y: '0%', opacity: 1 },
    exit: still ? { opacity: 0, transition: { duration: 0.4 } } : { y: `${direction * 100}%`, transition: CURTAIN_EASE },
  });

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          role="presentation"
          onClick={exitSplash}
          initial="hidden"
          animate="shown"
          exit="exit"
          // 等幕布动画结束后再卸载
          variants={{ hidden: {}, shown: {}, exit: { transition: { when: 'afterChildren' } } }}
          style={vars}
          className="pointer-events-none fixed inset-0 z-[100000] cursor-pointer select-none overflow-hidden"
        >
          {/* ================= 上幕布：头像 / 站名 / 日期 ================= */}
          <motion.div
            variants={curtain(-1)}
            style={{ height: SEAM }}
            className="pointer-events-auto absolute inset-x-0 top-0 z-[1] flex flex-col items-center justify-end overflow-hidden bg-slate-50 px-6 dark:bg-slate-950"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_18%_10%,rgba(244,114,182,0.16),transparent),radial-gradient(50%_50%_at_85%_30%,rgba(99,102,241,0.16),transparent)] dark:bg-[radial-gradient(60%_60%_at_18%_10%,rgba(236,72,153,0.12),transparent),radial-gradient(50%_50%_at_85%_30%,rgba(99,102,241,0.2),transparent)]" />

            <div className="relative flex flex-col items-center pb-[calc(var(--above)+1.75rem)]">
              <motion.div
                variants={{
                  hidden: { scale: 0.4, opacity: 0 },
                  shown: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 220, damping: 16, delay: 0.1 } },
                  exit: { opacity: 1 },
                }}
                className="relative h-20 w-20 sm:h-24 sm:w-24"
              >
                <motion.div
                  aria-hidden="true"
                  animate={still ? undefined : { rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-70 blur-[3px]"
                />
                <div className="relative h-full w-full rounded-full bg-white p-1.5 shadow-xl dark:bg-slate-900">
                  <AppImage
                    src={siteConfig.avatarUrl}
                    alt={siteConfig.authorName}
                    width={192}
                    height={192}
                    loading="eager"
                    fetchPriority="high"
                    className="h-full w-full rounded-full object-cover"
                  />
                </div>
              </motion.div>

              {/* 站名逐字浮现 */}
              <h1 className="mt-5 flex flex-wrap justify-center text-2xl font-black tracking-[0.12em] text-slate-800 dark:text-white sm:text-3xl" aria-label={siteConfig.title}>
                {titleChars.map((ch, i) => (
                  <motion.span
                    key={`${ch}-${i}`}
                    aria-hidden="true"
                    variants={{
                      hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
                      shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, delay: 0.35 + i * 0.045 } },
                      exit: { opacity: 1 },
                    }}
                    className={ch === ' ' ? 'w-[0.4em]' : ch === 'の' ? 'text-indigo-500' : ''}
                  >
                    {ch === ' ' ? ' ' : ch}
                  </motion.span>
                ))}
              </h1>

              {siteConfig.bio && (
                <motion.p variants={fade(0.8)} className="mt-2 text-sm font-medium tracking-[0.3em] text-slate-500 dark:text-slate-400">
                  {siteConfig.bio}
                </motion.p>
              )}
              <motion.p variants={fade(1)} className="mt-3 text-xs font-bold tabular-nums tracking-[0.2em] text-slate-400 dark:text-slate-500">
                {dateLine}
              </motion.p>
            </div>
          </motion.div>

          {/* ================= 下幕布：边缘 + 探头的角色 ================= */}
          <motion.div
            variants={curtain(1)}
            style={{ top: SEAM }}
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-[2] bg-slate-50 dark:bg-slate-950"
          >
            {/* 幕布边缘的发光线（从中间向两侧展开） */}
            <motion.div
              aria-hidden="true"
              variants={{
                hidden: { scaleX: 0, opacity: 0 },
                shown: { scaleX: 1, opacity: 1, transition: { duration: 0.7, delay: 0.1, ease: 'easeOut' } },
                exit: { opacity: 1 },
              }}
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/80 to-transparent shadow-[0_0_12px_rgba(129,140,248,0.7)] dark:via-indigo-300/70"
            />

            {banner && (
              // 角色先被幕布边缘裁住、从下往上探头；探头完成后放开裁切，让手搭在边缘上
              <motion.div
                variants={{
                  hidden: { clipPath: `inset(0% 0% ${(1 - banner.edge) * 100}% 0%)` },
                  shown: { clipPath: 'inset(0% 0% 0% 0%)', transition: { delay: still ? 0 : 1.05, duration: 0.01 } },
                  exit: { clipPath: 'inset(0% 0% 0% 0%)' },
                }}
                className="absolute left-1/2 top-[calc(var(--above)*-1)] h-[var(--bh)] w-[var(--bw)] -translate-x-1/2"
              >
                <motion.div
                  variants={{
                    hidden: { y: still ? '0%' : '100%' },
                    shown: { y: '0%', transition: { type: 'spring', stiffness: 140, damping: 15, delay: 0.45 } },
                    exit: { y: '0%' },
                  }}
                  className="relative h-full w-full"
                >
                  <AppImage
                    src={banner.src}
                    alt=""
                    fill
                    sizes="(min-width: 940px) 860px, 92vw"
                    loading="eager"
                    fetchPriority="high"
                    className="object-contain"
                  />
                </motion.div>
              </motion.div>
            )}

            <div className="flex flex-col items-center pt-[calc(var(--below)+1.75rem)]">
              <motion.div variants={fade(0.3)} className="relative h-[2px] w-40 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: (still ? REDUCED_DURATION_MS : DURATION_MS) / 1000 - 0.2, ease: 'easeInOut' }}
                  className="absolute inset-0 origin-left bg-gradient-to-r from-indigo-500 to-pink-500"
                />
              </motion.div>
              <motion.p variants={fade(1.3)} className="mt-5 text-[11px] tracking-[0.3em] text-slate-400/80 dark:text-slate-600">
                点击任意处跳过
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
