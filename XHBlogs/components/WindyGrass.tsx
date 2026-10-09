"use client";
// components/WindyGrass.tsx —— 屏幕底部随风摆动的草地（「完整」档、电脑端，见 BackgroundEffects）
//
// 64 根草叶分成 4 组，每组整体一起摆（各组节奏不同，看起来仍然此起彼伏）：
// 浏览器主线程每出一帧都要把所有正在动的元素样式过一遍，4 个元素在动比 64 个省得多。草叶本身是静止的。
import { useMemo } from 'react';
import { useTheme } from './ThemeProvider';
import { useIsClient } from '../lib/useIsClient';

interface WildBlade { id: number; height: number; width: number; opacity: number; left: string; isLeftCurve: boolean; }

const BLADE_COUNT = 64;
const GROUPS = [
  { duration: 34, delay: -3 },
  { duration: 42, delay: -17 },
  { duration: 29, delay: -9 },
  { duration: 47, delay: -26 },
];

function makeBlades(): WildBlade[] {
  return Array.from({ length: BLADE_COUNT }, (_, i) => ({
    id: i,
    height: 30 + Math.random() * 50,
    width: 1.5 + Math.random() * 2.5,
    opacity: 0.2 + Math.random() * 0.4,
    left: `${(i / BLADE_COUNT) * 100 + (Math.random() - 0.5) * 0.8}%`,
    isLeftCurve: Math.random() > 0.5,
  }));
}

export default function WindyGrass() {
  const { isDark } = useTheme();
  // 随机数只在浏览器里生成（服务端渲染和首帧为空），避免 Hydration 不一致
  const isClient = useIsClient();
  const blades = useMemo(() => (isClient ? makeBlades() : []), [isClient]);

  return (
    <div className="fixed bottom-0 left-0 w-full h-32 pointer-events-none z-10 overflow-hidden transition-colors duration-1000">
      {GROUPS.map((group, g) => (
        <div
          key={g}
          className="absolute inset-0 origin-bottom"
          style={{ animation: `swayWildGrass ${group.duration}s ease-in-out ${group.delay}s infinite` }}
        >
          {blades
            .filter((blade) => blade.id % GROUPS.length === g)
            .map((blade) => (
              <div
                key={blade.id}
                className="absolute bottom-0 flex items-end"
                style={{ left: blade.left, height: `${blade.height}px`, width: `${blade.width * 4}px`, opacity: blade.opacity }}
              >
                <div
                  // 白天变绿，晚上变白
                  className={`w-full h-full transition-colors duration-1000 ${isDark ? 'bg-gradient-to-t from-white/80 to-transparent' : 'bg-gradient-to-t from-emerald-500/80 to-transparent'}`}
                  style={{ width: `${blade.width}px`, borderRadius: blade.isLeftCurve ? '100% 0 0 100%' : '0 100% 100% 0', transform: blade.isLeftCurve ? 'translateX(50%)' : 'translateX(-50%)' }}
                />
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
