// components/WeatherIcon.tsx —— 天气种类对应的图标（晴 / 多云在夜里换成月亮）
import { Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudDrizzle, CloudSun, Haze, Moon, Snowflake, Sun, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WeatherIntensity, WeatherKind } from '../lib/weather';

export function weatherIcon(kind: WeatherKind, isDay: boolean, intensity: WeatherIntensity = 'normal'): LucideIcon {
  switch (kind) {
    case 'clear': return isDay ? Sun : Moon;
    case 'partly': return isDay ? CloudSun : CloudMoon;
    case 'cloudy': return Cloud;
    case 'rain': return intensity === 'light' ? CloudDrizzle : CloudRain;
    case 'thunder': return CloudLightning;
    case 'haze': return Haze;
    case 'fog': return CloudFog;
    case 'windy': return Wind;
    case 'snow': return Snowflake;
  }
}

/** 图标配色：晴天暖黄、雨天蓝、雷雨紫、雾霾灰 */
export const WEATHER_TINT: Record<WeatherKind, string> = {
  clear: 'text-amber-400',
  partly: 'text-amber-300',
  cloudy: 'text-slate-400',
  rain: 'text-sky-400',
  thunder: 'text-violet-400',
  haze: 'text-orange-300',
  fog: 'text-slate-300',
  windy: 'text-teal-400',
  snow: 'text-sky-200',
};

interface WeatherGlyphProps {
  kind: WeatherKind;
  isDay: boolean;
  intensity?: WeatherIntensity;
  className?: string;
  strokeWidth?: number;
}

/** 直接渲染天气图标（组件里用这个；需要图标「类型」本身时用 weatherIcon） */
export function WeatherGlyph({ kind, isDay, intensity = 'normal', ...props }: WeatherGlyphProps) {
  const p = { ...props, 'aria-hidden': true } as const;
  switch (kind) {
    case 'clear': return isDay ? <Sun {...p} /> : <Moon {...p} />;
    case 'partly': return isDay ? <CloudSun {...p} /> : <CloudMoon {...p} />;
    case 'cloudy': return <Cloud {...p} />;
    case 'rain': return intensity === 'light' ? <CloudDrizzle {...p} /> : <CloudRain {...p} />;
    case 'thunder': return <CloudLightning {...p} />;
    case 'haze': return <Haze {...p} />;
    case 'fog': return <CloudFog {...p} />;
    case 'windy': return <Wind {...p} />;
    case 'snow': return <Snowflake {...p} />;
  }
}
