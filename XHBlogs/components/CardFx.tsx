"use client";
// components/CardFx.tsx —— 卡片悬停光效 + 轻微 3D 倾斜，以及列表卡片的滚动浮现（全站一个组件管全部）
//
// 光效 / 倾斜：给卡片加 data-glow（跟随鼠标的柔光）、data-tilt（再加 3D 倾斜）
// - 只在有鼠标的设备上生效；「阅读」档关闭，「简洁」档只有光效，「完整」档光效 + 倾斜；减少动态效果时不倾斜
// - 整站只有一个 pointermove 监听，每帧最多更新一次，只改当前卡片上的 CSS 变量，不触发 React 重渲染
//
// 滚动浮现：给列表项加 data-reveal
// - 挂载时已经在屏幕里的直接显示（首屏不播动画，也不会先闪一下）；之后滚到眼前时依次浮现，每项只播一次
// - 换页、列表内容变化（筛选、搜索）后自动接管新出现的项
// 样式见 globals.css「卡片光效 / 滚动浮现」。

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useEffectsLevel } from './EffectGate';

const MAX_TILT = 5;
const STAGGER_MS = 70;
const STAGGER_GROUP = 6;

export default function CardFx() {
  const level = useEffectsLevel();
  const pathname = usePathname();

  // ---------- 光效 / 倾斜 ----------
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (level === 'off' || !fine.matches) return;
    const tiltOn = level === 'full' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let active: HTMLElement | null = null;
    let frame = 0;
    let lastEvent: PointerEvent | null = null;

    const reset = (el: HTMLElement) => {
      el.removeAttribute('data-glow-on');
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
    };

    const update = () => {
      frame = 0;
      const e = lastEvent;
      if (!e) return;
      const card = (e.target as Element | null)?.closest?.<HTMLElement>('[data-glow]') ?? null;
      if (card !== active) {
        if (active) reset(active);
        active = card;
      }
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.setAttribute('data-glow-on', '');
      card.style.setProperty('--gx', `${x}px`);
      card.style.setProperty('--gy', `${y}px`);
      if (tiltOn && card.hasAttribute('data-tilt')) {
        card.style.setProperty('--ry', `${((x / rect.width - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - y / rect.height) * 2 * MAX_TILT).toFixed(2)}deg`);
      }
    };

    const onMove = (e: PointerEvent) => {
      lastEvent = e;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      if (active) reset(active);
      active = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (active) reset(active);
    };
  }, [level]);

  // ---------- 滚动浮现 ----------
  useEffect(() => {
    const root = document.documentElement;
    if (level === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.remove('reveal-ready');
      document.querySelectorAll('[data-reveal]').forEach((el) => el.setAttribute('data-revealed', ''));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        let batch = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.style.transitionDelay = `${(batch++ % STAGGER_GROUP) * STAGGER_MS}ms`;
          el.setAttribute('data-revealed', '');
          io.unobserve(el);
          // 播完把延迟去掉，免得影响之后的悬停过渡
          window.setTimeout(() => el.style.removeProperty('transition-delay'), 900);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );

    const adopt = () => {
      document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed]):not([data-reveal-watched])').forEach((el) => {
        el.setAttribute('data-reveal-watched', '');
        // 已经在屏幕里的直接显示，不播动画
        if (el.getBoundingClientRect().top < window.innerHeight) el.setAttribute('data-revealed', '');
        else io.observe(el);
      });
    };

    adopt();
    // 先把首屏的项标记好，再打开「未显示的项先藏起来」的样式，所以不会闪
    root.classList.add('reveal-ready');

    let pending = 0;
    const mo = new MutationObserver(() => {
      window.clearTimeout(pending);
      pending = window.setTimeout(adopt, 50);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      window.clearTimeout(pending);
    };
  }, [level, pathname]);

  return null;
}
