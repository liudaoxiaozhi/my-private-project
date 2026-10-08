"use client";
// components/WeatherLayer.tsx —— 跟着真实天气变化的背景特效（数据见 lib/useWeather.ts）
//
// 放在背景图之上、页面内容之下：雨丝落在毛玻璃卡片后面会被模糊掉，像「窗外在下雨」，不挡文字。
// - 雨：斜斜的雨丝（大雨更密更快、小雨稀疏），整体蒙一层冷色
// - 雷雨：雨 + 偶尔一道闪电照亮背景（只在「完整」档）
// - 雾 / 霾 / 阴天：一层很淡的雾气或色调；晴天白天：右上角一团暖光；下雪：雪花
// - 「简洁」档雨丝减到四成、不闪电、雾不飘动；「阅读」档整个不挂载（见 app/layout.tsx 的 EffectGate）
// - 系统开了「减少动态效果」：只保留静态色调，不下雨不闪电
// 样式见 globals.css「天气特效」。网址加 ?weather=rain 等可以预览。

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useEffectsLevel } from './EffectGate';
import PetalField, { makePieces } from './PetalField';
import { useWeather } from '../lib/useWeather';
import { isDaytime } from '../lib/weather';
import type { WeatherIntensity } from '../lib/weather';
import { siteConfig } from '../siteConfig';
import { sendPetCommand } from '../lib/petBus';

/** 这些页面有自己的沉浸式背景 */
const EXCLUDED = [/^\/music(\/|$)/];

interface Drop {
  left: number;
  delay: number;
  duration: number;
  length: number;
  opacity: number;
}

function makeDrops(count: number, intensity: WeatherIntensity): Drop[] {
  const speed = intensity === 'heavy' ? 0.75 : intensity === 'light' ? 1.15 : 1;
  return Array.from({ length: count }, () => {
    const duration = (0.55 + Math.random() * 0.4) * speed;
    return {
      left: Math.random() * 100,
      delay: -Math.random() * duration,
      duration,
      length: 50 + Math.random() * 50,
      opacity: 0.35 + Math.random() * 0.5,
    };
  });
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

function Rain({ intensity, lite }: { intensity: WeatherIntensity; lite: boolean }) {
  // 只在浏览器里挂载（拿到天气之后），随机数放在初始化里不会和服务端不一致；参数变了由外面换 key 重新挂载
  const [drops] = useState<Drop[]>(() => {
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const base = intensity === 'heavy' ? 120 : intensity === 'light' ? 45 : 80;
    return makeDrops(Math.round(base * (mobile ? 0.5 : 1) * (lite ? 0.4 : 1)), intensity);
  });
  return (
    <div className="weather-rain">
      {drops.map((d, i) => (
        <span
          key={i}
          style={{ left: `${d.left}%`, height: d.length, opacity: d.opacity, animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }}
        />
      ))}
    </div>
  );
}

/** 闪电：每隔 6～16 秒随机闪一次 */
function Lightning() {
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(() => {
        setFlash((n) => n + 1);
        next();
      }, 6000 + Math.random() * 10_000);
    };
    next();
    return () => window.clearTimeout(timer);
  }, []);
  return flash > 0 ? <div key={flash} className="weather-flash" /> : null;
}

export default function WeatherLayer() {
  const weather = useWeather();
  const level = useEffectsLevel();
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const lite = level === 'lite';
  const snow = useMemo(() => (weather?.kind === 'snow' ? makePieces(lite ? 14 : 30) : []), [weather?.kind, lite]);

  if (!weather || level === 'off' || EXCLUDED.some((re) => re.test(pathname))) return null;
  const { kind, intensity } = weather;
  const animate = !reduced;
  const day = isDaytime(siteConfig.timeZone);

  return (
    <div className="weather-layer" data-weather={kind} aria-hidden="true">
      {(kind === 'rain' || kind === 'thunder') && <div className="weather-veil weather-veil-rain" />}
      {(kind === 'rain' || kind === 'thunder') && animate && (
        <Rain key={`${kind}-${intensity}-${level}`} intensity={kind === 'thunder' ? 'heavy' : intensity} lite={lite} />
      )}
      {kind === 'thunder' && animate && !lite && <Lightning />}
      {kind === 'cloudy' && <div className="weather-veil weather-veil-cloudy" />}
      {kind === 'haze' && <div className="weather-veil weather-veil-haze" />}
      {kind === 'fog' && (
        <div className="weather-veil weather-veil-fog">
          {animate && !lite && (
            <>
              <i className="weather-fog-drift" />
              <i className="weather-fog-drift weather-fog-drift-2" />
            </>
          )}
        </div>
      )}
      {(kind === 'clear' || kind === 'partly') && day && <div className={`weather-sun ${animate && !lite ? 'weather-sun-pulse' : ''}`} />}
      {kind === 'snow' && animate && <PetalField pieces={snow} season="snow" className="z-0" />}
    </div>
  );
}

// —— 桌宠的天气台词：每次浏览只说一次，等招呼、栏目台词说完再说 ——

const WEATHER_LINES: Partial<Record<string, string[]>> = {
  thunder: ['打雷了……我、我才不怕。Master 今天就别出门了。', '外面在打雷，待在屋里看会儿书吧。'],
  'rain-heavy': ['雨好大……今天就待在家里吧。', '外面下大雨了，出门记得带伞。'],
  rain: ['外面在下雨，Master 出门记得带伞。', '下雨了。要不要开一点雨声，配着看书？'],
  haze: ['外面有烟霾，出门记得戴口罩。'],
  fog: ['起雾了，路上小心。'],
  snow: ['下雪了！……好想出去看看。'],
  'clear-hot': ['今天好热，记得多喝水。', '太阳好大，出门记得防晒。'],
  'clear-day': ['今天天气真好，适合出去走走。'],
  'clear-night': ['今晚天气不错，适合看星星。'],
};
const NOTICE_KEY = 'pet-weather';
const NOTICE_DELAY = 8000;

/** 挂在根布局里（不受特效档位影响）：拿到天气后让桌宠说一句 */
export function WeatherNotice() {
  const weather = useWeather();
  useEffect(() => {
    if (!weather) return;
    const { kind, intensity, temp } = weather;
    const key =
      kind === 'rain' ? (intensity === 'heavy' ? 'rain-heavy' : 'rain')
      : kind === 'clear' ? (temp !== null && temp >= 33 ? 'clear-hot' : isDaytime(siteConfig.timeZone) ? 'clear-day' : 'clear-night')
      : kind;
    const lines = WEATHER_LINES[key];
    if (!lines) return;
    try {
      if (sessionStorage.getItem(NOTICE_KEY)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(NOTICE_KEY, '1');
      } catch {
        /* 忽略 */
      }
      sendPetCommand({ type: 'say', text: lines[Math.floor(Math.random() * lines.length)], ms: 5000 });
    }, NOTICE_DELAY);
    return () => window.clearTimeout(timer);
  }, [weather]);
  return null;
}
