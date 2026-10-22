"use client";
// components/EasterStorm.tsx —— 彩蛋的画面：樱花风暴 / 小撒花的花瓣，以及烟花
//
// 由 components/EasterEggs.tsx 在触发时才下载（不占首屏 JS）；监听按键、事件的逻辑仍在 EasterEggs 里常驻。

import { useMemo } from 'react';
import PetalField, { makePieces } from './PetalField';
import type { PieceOptions } from './PetalField';
import Fireworks from './Fireworks';
import { currentSeason } from './Sakura';

export interface StormSpec {
  /** 花瓣数量 */
  count: number;
  options: PieceOptions;
  fireworks: boolean;
  /** 整场持续多久（毫秒） */
  ms: number;
}

export default function EasterStorm({ spec }: { spec: StormSpec }) {
  // 每次触发（spec 换了一个）重新撒一把；随机数只在浏览器里生成（这个组件不在服务端渲染）
  const { pieces, season } = useMemo(() => ({ pieces: makePieces(spec.count, spec.options), season: currentSeason() }), [spec]);
  return (
    <>
      <PetalField pieces={pieces} season={season} once className="z-[56]" />
      {spec.fireworks && <Fireworks duration={spec.ms - 1000} />}
    </>
  );
}
