"use client";
// components/toolbox/EffectsTool.tsx —— 工具箱里的「特效」档位切换（档位说明见 lib/effects.ts）

import { useSyncExternalStore } from 'react';
import { Gauge, BookOpen, Sparkles, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getAutoLevel, getEffectsPreference, setEffectsPreference, subscribeEffects } from '../../lib/effects';
import type { EffectsLevel, EffectsPreference } from '../../lib/effects';

const LEVEL_NAMES: Record<EffectsLevel, string> = { full: '完整', lite: '简洁', off: '阅读' };

const OPTIONS: Array<{ id: EffectsPreference; name: string; hint: string; Icon: LucideIcon }> = [
  { id: 'auto', name: '自动', hint: '按设备性能选择', Icon: Wand2 },
  { id: 'full', name: '完整', hint: '樱花、弹幕、萤火虫、点击涟漪', Icon: Sparkles },
  { id: 'lite', name: '简洁', hint: '只留背景轮播和少量樱花', Icon: Gauge },
  { id: 'off', name: '阅读', hint: '静态背景，没有任何动画', Icon: BookOpen },
];

export default function EffectsTool() {
  const pref = useSyncExternalStore(subscribeEffects, getEffectsPreference, () => 'auto' as EffectsPreference);

  return (
    <div className="flex flex-col gap-2">
      {OPTIONS.map(({ id, name, hint, Icon }) => {
        const active = pref === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => setEffectsPreference(id)}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
              active
                ? 'bg-indigo-500 text-white shadow-md'
                : 'bg-white/50 text-slate-700 hover:bg-white/80 dark:bg-slate-700/50 dark:text-slate-200 dark:hover:bg-slate-700/80'
            }`}
          >
            <Icon size={18} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold">
                {name}
                {id === 'auto' && <span className="ml-1.5 text-[11px] font-medium opacity-75">（当前：{LEVEL_NAMES[getAutoLevel()]}）</span>}
              </span>
              <span className={`block truncate text-[11px] ${active ? 'text-white/80' : 'text-slate-400'}`}>{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
