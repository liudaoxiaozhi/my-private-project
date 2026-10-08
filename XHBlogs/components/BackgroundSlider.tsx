"use client";

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { siteConfig } from '../siteConfig';
import { DEFAULT_ACCENT_HUE, getImageMeta, toAccentHue } from '../lib/imageMeta';

/** 每张背景停留时长（毫秒） */
const SLIDE_INTERVAL_MS = 10_000;

interface BackgroundSlide {
  /** 桌面端（≥ md）使用的横图 */
  desktop: string;
  /** 移动端（< md）使用的竖图 */
  mobile: string;
}

/** 把图片地址安全地包进 CSS url()，防止地址里的空格、引号破坏样式 */
const cssUrl = (src: string): string => `url(${JSON.stringify(src)})`;

/** 原图叠在模糊缩略图上面：原图还没下载完时先看到模糊版，而不是空白 */
const cssLayers = (src: string): string => {
  const blur = getImageMeta(src)?.blur;
  return blur ? `${cssUrl(src)}, ${cssUrl(blur)}` : cssUrl(src);
};

/**
 * 全站强调色（Tailwind 的 indigo 色阶，见 globals.css）跟着当前背景的主色调走。
 * 沿色环上较近的方向过渡（350° → 10° 走 20°，而不是绕一大圈经过绿色）。
 */
function applyAccentFor(slide: BackgroundSlide): void {
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const target = toAccentHue(getImageMeta(isDesktop ? slide.desktop : slide.mobile)?.hue);
  const root = document.documentElement;
  const current = parseFloat(getComputedStyle(root).getPropertyValue('--accent-hue')) || DEFAULT_ACCENT_HUE;
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  if (Math.abs(delta) > 0.5) root.style.setProperty('--accent-hue', String(Math.round((current + delta) * 10) / 10));
}

/** 读取配置：桌面用 bgImages；移动端优先用 bgImagesMobile，未配置时回退到 bgImages */
function getImageSets(): { desktop: readonly string[]; mobile: readonly string[] } {
  const desktop: readonly string[] = siteConfig.bgImages ?? [];
  const mobile: readonly string[] =
    'bgImagesMobile' in siteConfig &&
    Array.isArray(siteConfig.bgImagesMobile) &&
    siteConfig.bgImagesMobile.length > 0
      ? siteConfig.bgImagesMobile
      : desktop;
  return { desktop, mobile };
}

/**
 * 两套图片按槽位配对，数量不同时各自循环取用。
 * 例：桌面 2 张、移动端 3 张 → 3 个槽位，桌面图按 0,1,0 轮换。
 */
function buildSlides(): BackgroundSlide[] {
  const { desktop, mobile } = getImageSets();
  const count = Math.max(desktop.length, mobile.length);
  return Array.from({ length: count }, (_, i) => ({
    desktop: desktop[i % desktop.length],
    mobile: mobile[i % mobile.length],
  }));
}

const slides = buildSlides();

export default function BackgroundSlider() {
  // 服务端与客户端首帧都从 0 开始，避免 Hydration 不一致
  const [index, setIndex] = useState(0);
  const total = slides.length;

  useEffect(() => {
    if (total <= 1) return;
    const timer = window.setInterval(() => {
      // 标签页在后台时不切换，回到前台不会出现连跳
      if (document.visibilityState === 'visible') {
        setIndex((prev) => (prev + 1) % total);
      }
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [total]);

  useEffect(() => {
    if (total > 0) applyAccentFor(slides[index]);
  }, [index, total]);

  if (total === 0) return null;

  const prev = (index - 1 + total) % total;
  const next = (index + 1) % total;

  return (
    <div className="absolute inset-0 z-[-10] overflow-hidden" aria-hidden="true">
      {/*
        模糊直接作用在图片层：静态 filter 只需栅格化一次，滚动时不会逐帧重算，
        比在其上方叠一层全屏 backdrop-filter 省得多。scale-110 用来盖住模糊后的透明边缘。
      */}
      <div className="absolute inset-0 scale-110 blur-md transform-gpu">
        {slides.map((slide, i) => {
          const isActive = i === index;
          // 只保留「当前 / 正在淡出的上一张 / 预加载的下一张」，其余不参与渲染合成
          const isMounted = isActive || i === prev || i === next;

          return (
            <div
              key={`${slide.desktop}|${slide.mobile}|${i}`}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-[2000ms] ease-in-out transform-gpu bg-[image:var(--bg-mobile)] md:bg-[image:var(--bg-desktop)]"
              style={
                {
                  '--bg-mobile': cssLayers(slide.mobile),
                  '--bg-desktop': cssLayers(slide.desktop),
                  opacity: isActive ? 1 : 0,
                  visibility: isMounted ? 'visible' : 'hidden',
                } as CSSProperties
              }
            />
          );
        })}
      </div>
    </div>
  );
}
