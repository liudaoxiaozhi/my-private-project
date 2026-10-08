"use client";
// components/EffectGate.tsx —— 按特效档位决定是否挂载某个特效（档位说明见 lib/effects.ts）
//
// 外层 data-fx 让 globals.css 在首屏就按档位隐藏（服务端不知道读者的档位，避免先显示再消失）；
// 挂载后再按真实档位卸载组件，连同它的脚本和动画一起停掉。

import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getEffectsLevel, meetsLevel, subscribeEffects } from '../lib/effects';
import type { EffectsLevel } from '../lib/effects';

export function useEffectsLevel(): EffectsLevel {
  return useSyncExternalStore(subscribeEffects, getEffectsLevel, () => 'full');
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
