"use client";
// components/HeroMontage.tsx —— 首页开场的「镜头蒙太奇」（siteConfig.homeHero.montage，默认关）
//
// - 「完整」档：开场变成一场定格的戏。页面在最顶端时，滚轮 / 手指上下滑 / ↓ PageDown 空格「蓄力」推进进度
//   （这时才拦下页面滚动），一根固定子步长的阻尼弹簧跟着目标走；4~6 个镜头按进度交叉溶解，
//   每个镜头有自己固定的缓慢平移和推拉（Ken Burns）。最后 15% 标题填色、出现「进入正文 ↓」，
//   到头后放开滚动并平滑滚到 #home-main。回到最顶端继续往上滚，进度倒退。
//   「跳过」直接到头；「自动播放」按每个镜头的时长自己放完。
// - 「简洁」档：不拦滚动，标题后面每 5 秒自动换一张图（只淡入淡出，不平移）
// - 「阅读」档、系统「减少动态效果」、没开蒙太奇：HomeHero 根本不挂载这个组件
//
// 画面全部由 rAF 直接写 style / CSS 变量（--hm-progress、--hm-fill），不走 React 状态。
//
// Technique adapted from Yuimi-chaya/yuimi-chaya.github.io (MIT), src/themes/kisara/lib/:
// gateStory.ts（固定半帧子步长的阻尼弹簧：30/60/120Hz 走同一条曲线，夹住不让弹簧越过输入方向）、
// gateAutoplay.ts（按镜头时长推进的自动播放）、gateMemoryEdit.ts / gateRelease.ts（进度的纯函数镜头表、放开交接）。
// 只借鉴做法，没有用任何素材。
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { siteConfig } from '../siteConfig';
import { albums } from '../data/albums';
import './hero-montage.css';

export type MontageMode = 'full' | 'lite';

const MAX_SHOTS = 6;
/** 滚轮像素：从 0 推到 1 需要滚多少 */
const FILL_DISTANCE = 1500;
/** 单次滚轮事件最多算多少（防止一下跳过好几个镜头） */
const MAX_WHEEL_STEP = 240;
/** 手指滑动的放大倍数 */
const TOUCH_GAIN = 2.25;
const SPRING_STRENGTH = 0.035;
const SPRING_DAMPING = 0.8;
const SETTLE = 0.0004;
/** 交叉溶解窗口：占一个镜头长度的比例 */
const DISSOLVE = 0.12;
/** 最后这一段标题填色 */
const FILL_START = 0.85;
/** 自动播放：每个镜头的时长（毫秒） */
const AUTOPLAY_MS = [1500, 1300, 1700, 1250, 1600, 1800];
const LITE_INTERVAL_MS = 5000;
/** 算「在最顶端」的容差（像素） */
const TOP_SLACK = 2;
/** 滚回顶端后要停一下再继续往上，才开始倒放（避免触控板惯性直接倒带） */
const REENGAGE_DELAY_MS = 160;
/** 放开后这段时间里的向下滚动不打断平滑滚动 */
const RELEASE_SETTLE_MS = 900;
/** 每个镜头固定的漂移方向（百分比，乘 local - 0.5） */
const DRIFT = [
  { x: -3.4, y: -1.2 },
  { x: 2.8, y: 1 },
  { x: -2.4, y: 1.8 },
  { x: 3.6, y: -1.4 },
  { x: -2, y: -2 },
  { x: 2.2, y: 1.4 },
];

/** 蒙太奇用的图片：homeHero.montageImages；留空用 bgImages + 照片墙照片。去重，最多 6 张 */
export function getMontageImages(): string[] {
  const own = (siteConfig.homeHero.montageImages ?? []).map((s) => String(s).trim()).filter(Boolean);
  const source = own.length > 0 ? own : [...(siteConfig.bgImages ?? []), ...albums.flatMap((a) => a.photos.map((p) => p.url))];
  return [...new Set(source.map((s) => String(s).trim()).filter(Boolean))].slice(0, MAX_SHOTS);
}

const unit = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const smooth = (v: number): number => {
  const p = unit(v);
  return p * p * (3 - 2 * p);
};
const between = (v: number, start: number, end: number): number => unit((v - start) / (end - start));
const pad = (k: number): string => String(k).padStart(2, '0');

/**
 * 阻尼弹簧：每次最多积分半个参考帧（16.67ms），掉帧和 30/60/120Hz 屏幕走同一条路径；
 * 结果夹在「当前值」和「目标」之间——方向只会因为输入反转，不会因为弹簧过冲回弹。
 */
export function advanceSpring(progress: number, target: number, velocity: number, frameRatio: number): { progress: number; velocity: number } {
  let remaining = Number.isFinite(frameRatio) ? Math.max(0, Math.min(3, frameRatio)) : 0;
  while (remaining > 0) {
    const step = Math.min(0.5, remaining);
    const speed = (velocity + (target - progress) * SPRING_STRENGTH * step) * Math.pow(SPRING_DAMPING, step);
    const candidate = progress + speed * step;
    const next = Math.max(Math.min(progress, target), Math.min(Math.max(progress, target), candidate));
    velocity = next === candidate ? speed : 0;
    progress = next;
    remaining -= step;
  }
  return { progress, velocity };
}

/** 自动播放：按每个镜头的时长推进（elapsed 毫秒，单帧最多算 50ms） */
export function advanceAutoplay(progress: number, elapsed: number, count: number): number {
  let next = unit(progress);
  let remaining = Math.max(0, Math.min(50, Number.isFinite(elapsed) ? elapsed : 0));
  for (let i = 0; i < count && remaining > 0; i++) {
    const start = i / count;
    const end = i === count - 1 ? 1 : (i + 1) / count;
    if (next >= end) continue;
    const rate = (end - start) / AUTOPLAY_MS[i % AUTOPLAY_MS.length];
    const used = Math.min(remaining, (end - next) / rate);
    next = Math.min(end, next + used * rate);
    remaining -= used;
  }
  return next > 1 - 1e-9 ? 1 : next;
}

interface ShotFrame {
  opacity: number;
  x: number;
  y: number;
  scale: number;
}

/**
 * 进度 → 每个镜头的画面（纯函数，倒放也一样）。后面的镜头叠在前面的上面淡入；
 * 某个镜头完全盖住之后，它下面的都隐藏。还没解码好的镜头不出现，停在上一个镜头。
 */
export function shotFrames(p: number, count: number, ready: readonly boolean[]): ShotFrame[] {
  const len = 1 / count;
  const w = DISSOLVE * len;
  const raw = Array.from({ length: count }, (_, i) => (!ready[i] ? 0 : i === 0 ? 1 : smooth(between(p, i * len - w / 2, i * len + w / 2))));
  let top = -1;
  for (let i = count - 1; i >= 0; i--) {
    if (raw[i] >= 1) {
      top = i;
      break;
    }
  }
  return raw.map((a, i) => {
    const local = between(p, i * len - w / 2, (i + 1) * len + w / 2);
    const drift = DRIFT[i % DRIFT.length];
    const zoomIn = i % 2 === 0;
    return {
      opacity: i < top ? 0 : a,
      x: (local - 0.5) * drift.x,
      y: (local - 0.5) * drift.y,
      scale: 1.06 + (zoomIn ? local : 1 - local) * 0.07,
    };
  });
}

interface HeroMontageProps {
  mode: MontageMode;
  images: string[];
  /** 开场的 <section>：CSS 变量、状态属性写在它上面，手指滑动也只在它上面监听 */
  sceneRef: RefObject<HTMLElement | null>;
  /** 开屏动画结束后再开始接管输入 */
  waitForSplash: (callback: () => void) => () => void;
}

interface MontageActions {
  skip: () => void;
  toggleAutoplay: () => void;
}

export default function HeroMontage({ mode, images, sceneRef, waitForSplash }: HeroMontageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const autoplayRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<MontageActions | null>(null);
  const count = images.length;

  // —— 预加载：decode() 好的镜头才参与画面 ——
  // 两种模式共用，所以放进各自的 effect 里（模式切换时重新开始）

  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!stage || !scene || count === 0) return;
    const shots = Array.from(stage.querySelectorAll<HTMLImageElement>('img[data-shot]'));
    const ready = shots.map(() => false);
    let disposed = false;
    const timers = new Set<number>();
    let onReady: () => void = () => {};
    shots.forEach((img, i) => {
      img
        .decode()
        .then(() => {
          if (disposed) return;
          ready[i] = true;
          stage.setAttribute('data-ready', '');
          onReady();
        })
        .catch(() => {
          /* 坏图：一直跳过这个镜头 */
        });
    });

    const cleanups: (() => void)[] = [];
    const listen = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, options?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, options);
      cleanups.push(() => window.removeEventListener(type, fn, options));
    };

    if (mode === 'lite') {
      // —— 简洁档：每 5 秒换一张，新图在上面淡入，旧图垫在下面 ——
      let active = -1;
      let prev = -1;
      let timer = 0;
      const show = (next: number) => {
        if (next === active) return;
        const img = shots[next];
        // 新图先压到 0（不带过渡），下一帧再淡入；两张图来回切时也不会直接跳出来
        img.removeAttribute('data-prev');
        img.style.transition = 'none';
        img.style.opacity = '0';
        void img.offsetWidth;
        img.style.removeProperty('transition');
        img.style.removeProperty('opacity');
        if (prev >= 0 && prev !== next) shots[prev].removeAttribute('data-prev');
        if (active >= 0) {
          shots[active].removeAttribute('data-active');
          shots[active].setAttribute('data-prev', '');
        }
        prev = active;
        active = next;
        img.setAttribute('data-active', '');
      };
      const tick = () => {
        for (let k = 1; k <= count; k++) {
          const next = (Math.max(active, 0) + k) % count;
          if (ready[next]) {
            show(next);
            return;
          }
        }
      };
      const start = () => {
        window.clearInterval(timer);
        timer = count > 1 && document.visibilityState === 'visible' ? window.setInterval(tick, LITE_INTERVAL_MS) : 0;
      };
      onReady = () => {
        if (active < 0) {
          const first = ready.findIndex(Boolean);
          if (first >= 0) show(first);
        }
      };
      onReady();
      start();
      document.addEventListener('visibilitychange', start);
      cleanups.push(() => document.removeEventListener('visibilitychange', start));
      cleanups.push(() => window.clearInterval(timer));
      return () => {
        disposed = true;
        cleanups.forEach((fn) => fn());
        shots.forEach((img) => {
          img.removeAttribute('data-active');
          img.removeAttribute('data-prev');
          img.removeAttribute('style');
        });
        stage.removeAttribute('data-ready');
      };
    }

    // —— 完整档 ——
    const atTop = () => window.scrollY <= TOP_SLACK;
    let progress = 0;
    let target = 0;
    let velocity = 0;
    let released = false;
    let autoplay = false;
    let listening = false;
    let armed = false;
    let raf = 0;
    let lastTs = 0;
    let shown = -1;
    let ending = false;
    let wasTop = atTop();
    let topSince = performance.now();
    let settleUntil = 0;
    let touchY: number | null = null;

    const paint = () => {
      const frames = shotFrames(progress, count, ready);
      frames.forEach((f, i) => {
        const s = shots[i].style;
        s.opacity = f.opacity.toFixed(4);
        s.visibility = f.opacity > 0 ? 'visible' : 'hidden';
        if (f.opacity > 0) s.transform = `translate3d(${f.x.toFixed(3)}%, ${f.y.toFixed(3)}%, 0) scale(${f.scale.toFixed(4)})`;
      });
      scene.style.setProperty('--hm-progress', progress.toFixed(4));
      scene.style.setProperty('--hm-fill', smooth(between(progress, FILL_START, 1)).toFixed(4));
      const nextEnding = progress >= FILL_START;
      if (nextEnding !== ending) {
        ending = nextEnding;
        scene.toggleAttribute('data-montage-ending', ending);
      }
      const index = Math.min(count - 1, Math.floor(progress * count));
      if (index !== shown) {
        shown = index;
        scene.setAttribute('data-montage-shot', String(index + 1));
        if (counterRef.current) counterRef.current.textContent = `${pad(index + 1)} / ${pad(count)}`;
      }
    };

    const syncAttrs = () => {
      scene.setAttribute('data-montage-state', released ? 'released' : 'capturing');
      scene.toggleAttribute('data-montage-autoplay', autoplay);
      const button = autoplayRef.current;
      if (button) {
        button.setAttribute('aria-pressed', String(autoplay));
        button.setAttribute('aria-label', autoplay ? '暂停自动播放' : '自动播放');
      }
    };

    const needsFrame = () => autoplay || progress !== target || velocity !== 0;
    const schedule = () => {
      if (!raf && !disposed && document.visibilityState === 'visible' && needsFrame()) raf = window.requestAnimationFrame(frame);
    };

    // 输入只在「最顶端，或刚放开的那一小会儿」才拦：其余时间不挂非被动监听，不影响正常滚动
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [aria-modal="true"], dialog')) return;
      const unitPx = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const delta = Math.max(-MAX_WHEEL_STEP, Math.min(MAX_WHEEL_STEP, e.deltaY * unitPx));
      if (input(delta, 'wheel') && e.cancelable) e.preventDefault();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onTouchEnd = () => {
      touchY = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || touchY === null) return;
      const y = e.touches[0].clientY;
      const delta = (touchY - y) * TOUCH_GAIN;
      touchY = y;
      if (input(delta, 'touch') && e.cancelable) e.preventDefault();
    };
    const arm = (want: boolean) => {
      if (want === armed) return;
      armed = want;
      if (want) {
        window.addEventListener('wheel', onWheel, { passive: false });
        scene.addEventListener('touchmove', onTouchMove, { passive: false });
      } else {
        window.removeEventListener('wheel', onWheel);
        scene.removeEventListener('touchmove', onTouchMove);
      }
    };
    const syncArm = () => arm(!disposed && listening && (!released || atTop() || performance.now() < settleUntil));

    const stopAutoplay = () => {
      if (!autoplay) return;
      autoplay = false;
      target = progress;
      velocity = 0;
      syncAttrs();
    };

    const release = (scroll: boolean) => {
      released = true;
      autoplay = false;
      progress = target = 1;
      velocity = 0;
      paint();
      syncAttrs();
      if (scroll) {
        settleUntil = performance.now() + RELEASE_SETTLE_MS;
        const t = window.setTimeout(() => {
          timers.delete(t);
          syncArm();
        }, RELEASE_SETTLE_MS + 50);
        timers.add(t);
        document.getElementById('home-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      syncArm();
    };

    const engage = () => {
      released = false;
      settleUntil = 0;
      syncAttrs();
      syncArm();
    };

    /** 返回 true 表示这次输入被蒙太奇吃掉了（调用方 preventDefault） */
    const input = (delta: number, kind: 'wheel' | 'touch' | 'key'): boolean => {
      if (!delta) return false;
      const now = performance.now();
      if (released) {
        // 刚放开时的惯性滚动：别打断去 #home-main 的平滑滚动
        if (kind !== 'touch' && delta > 0 && now < settleUntil) return true;
        if (delta >= 0 || !atTop()) return false;
        if (kind !== 'touch' && now - topSince < REENGAGE_DELAY_MS) return false;
        engage();
      } else if (!atTop()) {
        // 用滚动条等别的方式离开了顶端：直接算看完
        release(false);
        return false;
      }
      stopAutoplay();
      target = unit(target + delta / FILL_DISTANCE);
      schedule();
      return true;
    };

    function frame(ts: number) {
      raf = 0;
      if (disposed) return;
      const elapsed = lastTs ? ts - lastTs : 16.667;
      lastTs = ts;
      if (autoplay) {
        progress = target = advanceAutoplay(progress, elapsed, count);
        velocity = 0;
      } else {
        ({ progress, velocity } = advanceSpring(progress, target, velocity, elapsed / 16.667));
        if (Math.abs(target - progress) < SETTLE && Math.abs(velocity) < SETTLE) {
          progress = target;
          velocity = 0;
        }
      }
      paint();
      if (!released && target >= 1 && progress >= 1 - 1e-3) release(true);
      if (needsFrame()) schedule();
      else lastTs = 0;
    }

    const onKey = (e: KeyboardEvent) => {
      if (!listening || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('a, button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog')) return;
      const shot = FILL_DISTANCE / count;
      let amount = 0;
      if (e.key === 'ArrowDown') amount = 130;
      else if (e.key === 'ArrowUp') amount = -130;
      else if (e.key === 'PageDown') amount = shot;
      else if (e.key === 'PageUp') amount = -shot;
      else if (e.key === ' ') amount = e.shiftKey ? -shot : shot;
      if (amount && input(amount, 'key')) e.preventDefault();
    };

    const onScroll = () => {
      const top = atTop();
      if (top && !wasTop) topSince = performance.now();
      wasTop = top;
      if (listening && !released && !top) {
        stopAutoplay();
        release(false);
      }
      syncArm();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
      else {
        window.cancelAnimationFrame(raf);
        raf = 0;
        lastTs = 0;
      }
    };

    actionsRef.current = {
      skip: () => {
        stopAutoplay();
        release(true);
      },
      toggleAutoplay: () => {
        if (autoplay) {
          stopAutoplay();
          return;
        }
        if (released || !atTop()) return;
        autoplay = true;
        velocity = 0;
        lastTs = 0;
        syncAttrs();
        schedule();
      },
    };

    onReady = () => {
      paint();
      schedule();
    };
    paint();

    const stopSplash = waitForSplash(() => {
      if (disposed) return;
      listening = true;
      // 从文章返回等情况：页面不在顶端就当已经看完
      if (!atTop()) {
        released = true;
        progress = target = 1;
        paint();
      }
      syncAttrs();
      syncArm();
    });
    cleanups.push(stopSplash);
    listen('scroll', onScroll, { passive: true });
    listen('keydown', onKey);
    scene.addEventListener('touchstart', onTouchStart, { passive: true });
    scene.addEventListener('touchend', onTouchEnd, { passive: true });
    scene.addEventListener('touchcancel', onTouchEnd, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    cleanups.push(() => {
      scene.removeEventListener('touchstart', onTouchStart);
      scene.removeEventListener('touchend', onTouchEnd);
      scene.removeEventListener('touchcancel', onTouchEnd);
      document.removeEventListener('visibilitychange', onVisibility);
    });

    return () => {
      disposed = true;
      arm(false);
      window.cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      cleanups.forEach((fn) => fn());
      actionsRef.current = null;
      shots.forEach((img) => img.removeAttribute('style'));
      stage.removeAttribute('data-ready');
      scene.style.removeProperty('--hm-progress');
      scene.style.removeProperty('--hm-fill');
      for (const attr of ['data-montage-state', 'data-montage-autoplay', 'data-montage-ending', 'data-montage-shot']) scene.removeAttribute(attr);
    };
  }, [mode, images, count, sceneRef, waitForSplash]);

  return (
    <>
      <div ref={stageRef} className="hm-stage" data-mode={mode} aria-hidden="true">
        {images.map((src, i) => (
          // 纯装饰的全屏镜头；要 decode() 控制出场时机，所以不用 next/image
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${src}-${i}`} data-shot={i} className="hm-shot" src={src} alt="" decoding="async" fetchPriority={i === 0 ? 'high' : 'low'} draggable={false} />
        ))}
      </div>
      {mode === 'full' && (
        <div className="hm-overlay">
          <div className="hm-bar hm-bar-top" aria-hidden="true" />
          <div className="hm-bar hm-bar-bottom" aria-hidden="true" />
          <p className="hm-hint font-lab text-xs tracking-widest text-slate-100 sm:text-sm" aria-hidden="true">
            滚动 / 滑动 推进镜头 <span className="text-[#ff8fc4]">↓</span>
          </p>
          <button
            type="button"
            data-montage-enter=""
            onClick={() => actionsRef.current?.skip()}
            className="hm-enter font-lab rounded-full bg-slate-950/35 px-4 py-2 text-xs tracking-widest text-slate-100 backdrop-blur-sm transition-colors hover:text-[#ff8fc4] sm:text-sm"
          >
            进入正文 <span className="text-[#ff8fc4]">↓</span>
          </button>
          <div className="hm-controls">
            <span ref={counterRef} data-montage-counter="" className="font-lab rounded-full bg-slate-950/35 px-3 py-1.5 text-xs tabular-nums tracking-widest text-slate-100 backdrop-blur-sm" aria-label="当前镜头">
              {`01 / ${pad(count)}`}
            </span>
            <span className="flex gap-2">
              <button
                ref={autoplayRef}
                type="button"
                data-montage-autoplay-button=""
                aria-pressed="false"
                onClick={() => actionsRef.current?.toggleAutoplay()}
                className="font-lab rounded-full bg-slate-950/35 px-3 py-1.5 text-xs tracking-widest text-slate-100 backdrop-blur-sm transition-colors hover:text-[#ff8fc4]"
              >
                {/* 文字跟着 aria-pressed 切换（hero-montage.css），不用 React 状态 */}
                <span className="hm-play-label">自动播放</span>
                <span className="hm-pause-label">暂停</span>
              </button>
              <button
                type="button"
                data-montage-skip=""
                onClick={() => actionsRef.current?.skip()}
                className="font-lab rounded-full bg-slate-950/35 px-3 py-1.5 text-xs tracking-widest text-slate-100 backdrop-blur-sm transition-colors hover:text-[#ff8fc4]"
              >
                跳过
              </button>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
