"use client";

import { useMemo } from 'react';
import { useIsClient } from '../lib/useIsClient';
import { siteConfig } from '../siteConfig';

interface DanmakuItem {
  id: number;
  text: string;
  top: number;
  duration: number;
  delay: number;
}

/** 分成几条「车道」，同一车道上的弹幕速度相同、前后均匀错开，不会叠在一起 */
function makeDanmakus(list: string[]): DanmakuItem[] {
  const lanes = 4;
  const perLane = 2;
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  const generatedDanmakus: DanmakuItem[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const duration = 30 + Math.random() * 12;
    for (let k = 0; k < perLane; k++) {
      const id = lane * perLane + k;
      generatedDanmakus.push({
        id,
        text: shuffled[id % shuffled.length],
        // 容器只有 30vh 高，车道均匀分布在 10%～85% 之间
        top: 10 + (lane * 75) / (lanes - 1),
        duration,
        // 负的延迟：一打开就已经在半路上，同一车道相隔半圈
        delay: -((k + Math.random() * 0.3) * duration) / perLane,
      });
    }
  }
  return generatedDanmakus;
}

export default function DanmakuBackground() {
  // 随机数只在浏览器里生成（首帧和服务端渲染都是空的），避免 Hydration 不一致
  const isClient = useIsClient();
  const danmakus = useMemo<DanmakuItem[]>(() => {
    const list = siteConfig.danmakuList || [];
    if (!isClient || list.length === 0) return [];

    return makeDanmakus(list);
  }, [isClient]);

  return (
    // 🌟 终极限制：去掉了 bottom-0，换成了 h-[30vh] 强制锁死容器高度！
    // 并且加上 z-0 确保它在卡片矩阵的后面
    <div className="fixed top-28 h-[30vh] left-0 right-0 overflow-hidden pointer-events-none z-0">
      {danmakus.map((item) => (
        <div
          key={item.id}
          className="absolute whitespace-nowrap text-white/30 dark:text-white/10 font-bold text-lg tracking-wider select-none"
          style={{
            top: `${item.top}%`,
            left: 0,
            willChange: 'transform',
            animation: `float-left ${item.duration}s linear ${item.delay}s infinite`,
          }}
        >
          {item.text}
        </div>
      ))}

      <style dangerouslySetInnerHTML={{
        __html: `
        /* 🚀 只用 transform 移动（合成器完成），旧版改 right 属性会导致每帧重新排版 */
        @keyframes float-left {
          from { transform: translateX(100vw); }
          to { transform: translateX(-100%); }
        }
      `}} />
    </div>
  );
}