"use client";
// components/Sakura.tsx —— 全站樱花飘落（siteConfig.enableSakura 开关）
//
// - 花瓣用 SVG 绘制（带缺口的樱花瓣 + 渐变），纯 CSS 动画：下落、左右摇摆、翻转三层叠加，只动 transform / opacity
//   （不给花瓣加 filter：旋转中的元素带 filter 每帧都要重新栅格化）
// - 放在页面最上层、不拦截点击。放在毛玻璃卡片「前面」而不是背景里：背景里的动画会让每张毛玻璃卡片
//   每一帧都重新计算模糊，是卡顿的主要来源
// - 电脑 24 片、手机 10 片；夜间模式更淡；系统开启「减少动态效果」时不显示
// - 首帧（含服务端渲染）不渲染任何花瓣，挂载后再随机生成，避免 Hydration 不一致

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';

interface Petal {
  id: number;
  left: number;      // 起始横向位置（vw）
  size: number;      // px
  fall: number;      // 下落时长（秒）
  delay: number;     // 负数：让花瓣一开始就分布在半空
  drift: number;     // 整体横向漂移（vw）
  sway: number;      // 摇摆幅度（px）
  swayDur: number;
  flipDur: number;
  alpha: number;     // 深浅微调
}

type CSSVars = CSSProperties & Record<`--${string}`, string>;

/** 这些页面有自己的沉浸式背景，不飘樱花 */
const EXCLUDED = [/^\/music(\/|$)/];

function makePetals(count: number): Petal[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    size: 10 + Math.random() * 10,
    fall: 11 + Math.random() * 9,
    delay: -Math.random() * 20,
    drift: 8 + Math.random() * 16,
    sway: 20 + Math.random() * 40,
    swayDur: 2.6 + Math.random() * 2.4,
    flipDur: 2.2 + Math.random() * 2.8,
    alpha: 0.7 + Math.random() * 0.3,
  }));
}

export default function Sakura() {
  const pathname = usePathname();
  const { isDark } = useTheme();
  const [petals, setPetals] = useState<Petal[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 767px)');
    const update = () => setPetals(reduce.matches ? [] : makePetals(mobile.matches ? 10 : 24));
    update();
    reduce.addEventListener('change', update);
    mobile.addEventListener('change', update);
    return () => {
      reduce.removeEventListener('change', update);
      mobile.removeEventListener('change', update);
    };
  }, []);

  if (petals.length === 0 || EXCLUDED.some((re) => re.test(pathname ?? ''))) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[55] overflow-hidden transition-opacity duration-1000"
      style={{ opacity: isDark ? 0.55 : 0.9 }}
    >
      <style>{`
        @keyframes sakura-fall {
          0%   { transform: translate3d(0, -8vh, 0); opacity: 0; }
          8%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(var(--drift), 108vh, 0); opacity: 0; }
        }
        @keyframes sakura-sway {
          from { transform: translateX(calc(var(--sway) * -1)); }
          to   { transform: translateX(var(--sway)); }
        }
        @keyframes sakura-flip {
          0%   { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          50%  { transform: rotateX(160deg) rotateY(40deg) rotateZ(120deg); }
          100% { transform: rotateX(360deg) rotateY(0deg) rotateZ(260deg); }
        }
      `}</style>

      {/* 共用的花瓣形状与渐变 */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="sakura-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe4ee" />
            <stop offset="55%" stopColor="#ffb7cf" />
            <stop offset="100%" stopColor="#f58fb1" />
          </linearGradient>
          {/* 花瓣：圆润的上端带一个小缺口，下端收尖 */}
          <path id="sakura-petal" d="M12 23C6 19 2 13 3 8c.7-3.6 3.6-6 6.2-5.4L12 6l2.8-3.4C17.4 2 20.3 4.4 21 8c1 5-3 11-9 15z" fill="url(#sakura-grad)" />
        </defs>
      </svg>

      {petals.map((p) => (
        <div
          key={p.id}
          className="absolute top-0"
          style={{
            left: `${p.left}vw`,
            animation: `sakura-fall ${p.fall}s linear ${p.delay}s infinite`,
            '--drift': `${p.drift}vw`,
          } as CSSVars}
        >
          <div
            style={{
              animation: `sakura-sway ${p.swayDur}s ease-in-out ${p.delay}s infinite alternate`,
              '--sway': `${p.sway}px`,
            } as CSSVars}
          >
            <svg
              width={p.size}
              height={p.size}
              viewBox="0 0 24 24"
              style={{
                animation: `sakura-flip ${p.flipDur}s linear ${p.delay}s infinite`,
                opacity: p.alpha,
              }}
            >
              <use href="#sakura-petal" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}
