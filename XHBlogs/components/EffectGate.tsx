"use client";
// components/EffectGate.tsx —— 按特效档位决定是否挂载某个特效（档位说明见 lib/effects.ts）
//
// 外层 data-fx 让 globals.css 在首屏就按档位隐藏（服务端不知道读者的档位，避免先显示再消失）；
// 挂载后再按真实档位卸载组件，连同它的脚本和动画一起停掉。

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getEffectsLevel, meetsLevel, reduceMotion, subscribeEffects, subscribeReduceMotion } from '../lib/effects';
import type { EffectsLevel } from '../lib/effects';

export function useEffectsLevel(): EffectsLevel {
  return useSyncExternalStore(subscribeEffects, getEffectsLevel, () => 'full');
}

/** 是否该减少动画（系统要求减少动态且读者没手动选档位，见 lib/effects.ts）；服务端按「不减少」渲染 */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribeReduceMotion, reduceMotion, () => false);
}

interface EffectGateProps {
  /** 至少需要哪一档才显示 */
  min: Exclude<EffectsLevel, 'off'>;
  className?: string;
  children: ReactNode;
}

export default function EffectGate({ min, className, children }: EffectGateProps) {
  const level = useEffectsLevel();
  return (
    <div data-fx={min} className={className}>
      {meetsLevel(level, min) ? children : null}
    </div>
  );
}
