"use client";
// components/toolbox/AmbientTool.tsx —— 工具箱里的「白噪音」：雨声、海浪、篝火、粉 / 棕噪声，可叠加、各自调音量
// 声音在浏览器里实时合成（lib/ambient.ts），关掉工具箱、站内换页都会继续播放。

import { useSyncExternalStore } from 'react';
import { AudioWaveform, CloudRain, Flame, Mountain, Square, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  getAmbientState,
  getServerAmbientState,
  setAmbientVolume,
  stopAllAmbient,
  subscribeAmbient,
  toggleAmbient,
} from '../../lib/ambient';
import type { AmbientId } from '../../lib/ambient';
import { useWeather } from '../../lib/useWeather';

const SOUNDS: Array<{ id: AmbientId; name: string; hint: string; Icon: LucideIcon }> = [
  { id: 'rain', name: '雨声', hint: '窗外的小雨', Icon: CloudRain },
  { id: 'waves', name: '海浪', hint: '一阵一阵的潮声', Icon: Waves },
  { id: 'fire', name: '篝火', hint: '噼啪作响的柴火', Icon: Flame },
  { id: 'pink', name: '粉噪声', hint: '柔和，适合专注', Icon: AudioWaveform },
  { id: 'brown', name: '棕噪声', hint: '低沉，适合入睡', Icon: Mountain },
];

export default function AmbientTool() {
  const state = useSyncExternalStore(subscribeAmbient, getAmbientState, getServerAmbientState);
  const anyPlaying = Object.values(state.playing).some(Boolean);
  // 站长那边正在下雨时，「雨声」的说明换成实况
  const weather = useWeather();
  const rainingNow = weather?.kind === 'rain' || weather?.kind === 'thunder';

  return (
    <div className="flex flex-col gap-2">
      {SOUNDS.map(({ id, name, hint, Icon }) => {
        const on = state.playing[id];
        return (
          <div
            key={id}
            className={`rounded-2xl transition-colors ${on ? 'bg-indigo-500/10 ring-1 ring-indigo-500/40' : 'bg-white/50 dark:bg-slate-700/50'}`}
          >
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggleAmbient(id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  on ? 'bg-indigo-500 text-white' : 'bg-white/70 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Icon size={16} className={on ? 'animate-pulse' : ''} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${on ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>{name}</span>
                {id === 'rain' && rainingNow ? (
                  <span className="block truncate text-[11px] font-bold text-sky-500">{weather.city}窗外正在下雨</span>
                ) : (
                  <span className="block truncate text-[11px] text-slate-400">{hint}</span>
                )}
              </span>
            </button>
            {on && (
              <div className="px-3 pb-2.5">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(state.volume[id] * 100)}
                  onChange={(e) => setAmbientVolume(id, Number(e.target.value) / 100)}
                  aria-label={`${name}音量`}
                  className="w-full accent-indigo-500"
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-slate-400">
        <span>可以几种叠着放，也能和音乐一起听</span>
        {anyPlaying && (
          <button
            type="button"
            onClick={stopAllAmbient}
            className="flex shrink-0 items-center gap-1 font-bold text-slate-500 transition-colors hover:text-indigo-500 dark:text-slate-300"
          >
            <Square size={11} /> 全部停止
          </button>
        )}
      </div>
    </div>
  );
}
