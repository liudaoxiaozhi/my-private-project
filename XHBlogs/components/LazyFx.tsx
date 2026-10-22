"use client";
// components/LazyFx.tsx —— 根布局里不急用的客户端组件：拆成单独的包按需下载，不占首屏的 JS
//
// app/layout.tsx 是服务端组件，不能直接写 dynamic(..., { ssr: false })，所以集中在这个客户端模块里包一层再导出。
// 这些组件的服务端 HTML 本来就是空的（或者只在电脑端显示），改成只在浏览器里加载后首屏看起来一样：
// - 樱花飘落、天气特效、天气台词、左下角工具箱：水合时就开始下载，不等空闲
// - 草地、点击涟漪、桌宠：页面空闲后才挂载（useIdle，最多等 1.5 秒）
// - 外面套着 hidden md:block、只在电脑端显示的：手机上不下载（useDesktopSeen）
// 外层的 EffectGate / HideOnReader 仍写在 layout 里，data-fx 照样在首屏按档位隐藏。
// ⌘K 命令面板见 components/LazyCommandPalette.tsx（第一次打开时才下载）。
// 桌宠挂载前别处发给她的话会先记下来，挂载时补上（lib/petBus.ts）。

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useDesktopSeen, useIdle } from '../lib/useIdle';

/** 页面空闲后才渲染 children */
export function WhenIdle({ children }: { children: ReactNode }) {
  return useIdle() ? <>{children}</> : null;
}

/** 窗口达到过电脑端宽度才渲染 children（只用于外面已经 hidden md:block 的东西） */
export function DesktopOnly({ children }: { children: ReactNode }) {
  return useDesktopSeen() ? <>{children}</> : null;
}

// —— 水合后马上加载 ——

export const Sakura = dynamic(() => import('./Sakura'), { ssr: false });
export const WeatherLayer = dynamic(() => import('./WeatherLayer'), { ssr: false });
export const WeatherFront = dynamic(() => import('./WeatherLayer').then((m) => m.WeatherFront), { ssr: false });
export const WeatherNotice = dynamic(() => import('./WeatherLayer').then((m) => m.WeatherNotice), { ssr: false });

const GlobalToolboxChunk = dynamic(() => import('./GlobalToolbox'), { ssr: false });

/** 左下角工具箱（电脑端） */
export function GlobalToolbox() {
  return (
    <DesktopOnly>
      <GlobalToolboxChunk />
    </DesktopOnly>
  );
}

// —— 页面空闲后再加载（都只在电脑端显示） ——

const BackgroundEffectsChunk = dynamic(() => import('./BackgroundEffects'), { ssr: false });
const ClickEffectChunk = dynamic(() => import('./ClickEffect'), { ssr: false });
const PetSaberChunk = dynamic(() => import('./PetSaber'), { ssr: false });

/** 背景底部的草地 */
export function BackgroundEffects() {
  return (
    <WhenIdle>
      <DesktopOnly>
        <BackgroundEffectsChunk />
      </DesktopOnly>
    </WhenIdle>
  );
}

/** 点击涟漪 */
export function ClickEffect() {
  return (
    <WhenIdle>
      <DesktopOnly>
        <ClickEffectChunk />
      </DesktopOnly>
    </WhenIdle>
  );
}

/** 右下角桌宠（台子兼迷你播放器） */
export function PetSaber() {
  return (
    <WhenIdle>
      <DesktopOnly>
        <PetSaberChunk />
      </DesktopOnly>
    </WhenIdle>
  );
}
