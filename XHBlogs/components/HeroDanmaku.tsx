"use client";
// components/HeroDanmaku.tsx —— 首页开场上飘过的弹幕（siteConfig.enableDanmaku，文字来自 siteConfig.danmakuList + 最新文章标题）
//
// - B 站那样的白字黑描边，少数几条是彩色的；分「车道」走，同一车道等距错开，不会叠在一起
// - 车道避开中间的大标题和终端行，标题不被挡
// - 只在开场这一屏里飘（这里没有毛玻璃卡片，动的东西不会拖累模糊计算）；滚走了就暂停
// - 「完整」档全量、「简洁」档减半、「阅读」档和系统「减少动态效果」时不显示（由 HomeHero 决定是否挂载）

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsClient } from '../lib/useIsClient';

interface Danmaku {
  id: number;
  text: string;
  /** 车道的位置（占开场高度的百分比） */
  top: number;
  duration: number;
  delay: number;
  size: number;
  color: string | null;
}

/** 车道：上面一组在标题上方，下面一组在终端行和「往下滚」之间 */
const LANES = [9, 15, 21, 27, 71, 77, 83];
const COLORS = ['#ff8fc4', '#8fd0ff', '#ffd166', '#9ff0cf'];

function makeDanmaku(texts: string[], lanes: number[], mobile: boolean): Danmaku[] {
  const pool = [...texts].sort(() => Math.random() - 0.5);
  const perLane = 2;
  const items: Danmaku[] = [];
  lanes.forEach((top, lane) => {
    // 手机屏幕窄，飘慢一点才看得清
    const duration = (mobile ? 11 : 16) + Math.random() * 8;
    for (let k = 0; k < perLane; k++) {
      const id = lane * perLane + k;
      items.push({
        id,
        text: pool[id % pool.length],
        top,
        duration,
        // 负的延迟：一打开就已经有弹幕在半路上；同一车道相隔半圈
        delay: -((k + 0.15 + Math.random() * 0.5) * duration) / perLane,
        size: (mobile ? 13 : 16) + Math.round(Math.random() * (mobile ? 3 : 6)),
        color: Math.random() < 0.22 ? COLORS[Math.floor(Math.random() * COLORS.length)] : null,
      });
    }
  });
  return items;
}

export default function HeroDanmaku({ texts, lite }: { texts: string[]; lite: boolean }) {
  const isClient = useIsClient();
  const items = useMemo(() => {
    if (!isClient || texts.length === 0) return [];
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const lanes = lite || mobile ? LANES.filter((_, i) => i % 2 === 0) : LANES;
    return makeDanmaku(texts, lanes, mobile);
  }, [isClient, texts, lite]);

  // 开场滚出屏幕就暂停，回来接着飘
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="danmaku-layer" data-paused={paused ? '' : undefined} aria-hidden="true">
      {items.map((d) => (
        <span
          key={d.id}
          className="danmaku"
          style={{
            top: `${d.top}%`,
            fontSize: d.size,
            color: d.color ?? undefined,
            animation: `danmaku-fly ${d.duration}s linear ${d.delay}s infinite`,
          }}
        >
          {d.text}
        </span>
      ))}
    </div>
  );
}
