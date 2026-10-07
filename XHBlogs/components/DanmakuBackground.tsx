"use client";

import { useEffect, useState } from 'react';
import { siteConfig } from '../siteConfig';

interface DanmakuItem {
  id: number;
  text: string;
  top: number;
  duration: number;
  delay: number;
}

export default function DanmakuBackground() {
  const [danmakus, setDanmakus] = useState<DanmakuItem[]>([]);

  useEffect(() => {
    const list = siteConfig.danmakuList || [];
    if (list.length === 0) return;

    const generatedDanmakus: DanmakuItem[] = [];
    const count = 10; // 🚀 15 → 10

    for (let i = 0; i < count; i++) {
      generatedDanmakus.push({
        id: i,
        text: list[Math.floor(Math.random() * list.length)],
        // 现在容器本身只有 30vh 高，这里的 0-100% 就是在这个 30vh 内部随机
        // 我们留一点边距 10-90，防止字被切掉一半
        top: Math.random() * 80 + 10,
        duration: Math.random() * 20 + 25,
        delay: Math.random() * 20,
      });
    }
    setDanmakus(generatedDanmakus);
  }, []);

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