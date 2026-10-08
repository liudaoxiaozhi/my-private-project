"use client";
// components/PetalField.tsx —— 飘落层：樱花 / 雪花 / 红梅 / 彩纸共用（Sakura 常驻飘落、科乐美彩蛋的樱花风暴都用它）
//
// 每片都是「下落 + 左右摇摆 + 翻转」三层 CSS 动画叠加，只动 transform / opacity（关键帧在 globals.css）；
// 不给花瓣加 filter：旋转中的元素带 filter 每帧都要重新栅格化。

import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Season } from '../lib/seasons';

export interface Piece {
  id: number;
  left: number;      // 起始横向位置（vw）
  size: number;      // px
  fall: number;      // 下落时长（秒）
  delay: number;     // 常驻模式为负数（一开始就分布在半空）；一次性模式为正数（陆续落下）
  drift: number;     // 整体横向漂移（vw）
  sway: number;      // 摇摆幅度（px）
  swayDur: number;
  flipDur: number;
  alpha: number;     // 深浅微调
  shape: number;     // 用第几种形状（对 shapes 数量取余）
}

interface PieceOptions {
  /** 下落时长范围（秒） */
  fall?: [number, number];
  /** 一次性模式：delay 取 [0, max]；常驻模式：取 [-max, 0] */
  delayMax?: number;
  once?: boolean;
  size?: [number, number];
}

export function makePieces(count: number, { fall = [11, 20], delayMax = 20, once = false, size = [10, 20] }: PieceOptions = {}): Piece[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    size: size[0] + Math.random() * (size[1] - size[0]),
    fall: fall[0] + Math.random() * (fall[1] - fall[0]),
    delay: (once ? 1 : -1) * Math.random() * delayMax,
    drift: 8 + Math.random() * 16,
    sway: 20 + Math.random() * 40,
    swayDur: 2.6 + Math.random() * 2.4,
    flipDur: 2.2 + Math.random() * 2.8,
    alpha: 0.7 + Math.random() * 0.3,
    shape: Math.floor(Math.random() * 12),
  }));
}

type CSSVars = CSSProperties & Record<`--${string}`, string>;

const PETAL_PATH = 'M12 23C6 19 2 13 3 8c.7-3.6 3.6-6 6.2-5.4L12 6l2.8-3.4C17.4 2 20.3 4.4 21 8c1 5-3 11-9 15z';

function gradient(id: string, stops: string[]): ReactNode {
  return (
    <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="1">
      {stops.map((color, i) => (
        <stop key={color + i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={color} />
      ))}
    </linearGradient>
  );
}

/** 每种季节的形状：返回 <defs> 内容和各形状的 id（id 带前缀，页面上同时有两层也不会冲突） */
function seasonShapes(season: Season, p: string): { defs: ReactNode; shapes: string[] } {
  switch (season) {
    case 'snow':
      return {
        defs: (
          <>
            {gradient(`${p}g`, ['#ffffff', '#e0f2fe'])}
            <g id={`${p}flake`} stroke={`url(#${p}g)`} strokeWidth="1.8" strokeLinecap="round" fill="none">
              <path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10" />
              <path d="M12 5.5 9.8 3.3M12 5.5l2.2-2.2M12 18.5l-2.2 2.2M12 18.5l2.2 2.2" />
            </g>
            <circle id={`${p}dot`} cx="12" cy="12" r="4" fill="#ffffff" opacity="0.9" />
          </>
        ),
        shapes: [`${p}flake`, `${p}dot`, `${p}dot`],
      };
    case 'plum':
      return {
        defs: (
          <>
            {gradient(`${p}red`, ['#ffd6d6', '#ef5350', '#b71c1c'])}
            {gradient(`${p}gold`, ['#fff8e1', '#ffd54f', '#f9a825'])}
            <g id={`${p}flower`} fill={`url(#${p}red)`}>
              <circle cx="12" cy="6.5" r="4.2" />
              <circle cx="17.2" cy="10.3" r="4.2" />
              <circle cx="15.2" cy="16.6" r="4.2" />
              <circle cx="8.8" cy="16.6" r="4.2" />
              <circle cx="6.8" cy="10.3" r="4.2" />
              <circle cx="12" cy="12" r="2.3" fill="#ffd54f" />
            </g>
            <path id={`${p}petal`} d={PETAL_PATH} fill={`url(#${p}red)`} />
            <path id={`${p}gold-petal`} d={PETAL_PATH} fill={`url(#${p}gold)`} />
          </>
        ),
        shapes: [`${p}flower`, `${p}petal`, `${p}petal`, `${p}gold-petal`],
      };
    case 'confetti': {
      const colors = ['#f472b6', '#818cf8', '#34d399', '#fbbf24', '#38bdf8'];
      return {
        defs: (
          <>
            {colors.map((c, i) => (
              <rect key={c} id={`${p}c${i}`} x="7" y="3" width="10" height="18" rx="2" fill={c} />
            ))}
            <circle id={`${p}round`} cx="12" cy="12" r="5" fill="#f472b6" />
          </>
        ),
        shapes: [...colors.map((_, i) => `${p}c${i}`), `${p}round`],
      };
    }
    default:
      return {
        defs: (
          <>
            {gradient(`${p}g`, ['#ffe4ee', '#ffb7cf', '#f58fb1'])}
            {/* 花瓣：圆润的上端带一个小缺口，下端收尖 */}
            <path id={`${p}petal`} d={PETAL_PATH} fill={`url(#${p}g)`} />
          </>
        ),
        shapes: [`${p}petal`],
      };
  }
}

interface PetalFieldProps {
  pieces: Piece[];
  season: Season;
  opacity?: number;
  /** 只落一次（彩蛋）；默认无限循环 */
  once?: boolean;
  className?: string;
}

export default function PetalField({ pieces, season, opacity = 1, once = false, className = 'z-[55]' }: PetalFieldProps) {
  const prefix = `pf${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  const { defs, shapes } = seasonShapes(season, prefix);
  const iterations = once ? '1 both' : 'infinite';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 overflow-hidden transition-opacity duration-1000 ${className}`}
      style={{ opacity }}
    >
      <svg width="0" height="0" className="absolute">
        <defs>{defs}</defs>
      </svg>

      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute top-0"
          style={{
            left: `${p.left}vw`,
            animation: `petal-fall ${p.fall}s linear ${p.delay}s ${iterations}`,
            '--drift': `${p.drift}vw`,
          } as CSSVars}
        >
          <div
            style={{
              animation: `petal-sway ${p.swayDur}s ease-in-out ${p.delay}s infinite alternate`,
              '--sway': `${p.sway}px`,
            } as CSSVars}
          >
            <svg
              width={p.size}
              height={p.size}
              viewBox="0 0 24 24"
              style={{
                animation: `petal-flip ${p.flipDur}s linear ${p.delay}s infinite`,
                opacity: p.alpha,
              }}
            >
              <use href={`#${shapes[p.shape % shapes.length]}`} />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}
