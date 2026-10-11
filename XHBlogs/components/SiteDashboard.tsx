"use client";

import { useEffect, useSyncExternalStore } from 'react';
// 🌟 引入咱们的控制中心配置
import { siteConfig } from '../siteConfig';
import { formatClock, formatDateParts, formatUtcOffset, isValidTimeZone, parseInTimeZone } from '../lib/time';
import { useWeather } from '../lib/useWeather';
import { isDaytime } from '../lib/weather';
import type { WeatherReport } from '../lib/weather';
import { WEATHER_TINT, WeatherGlyph } from './WeatherIcon';

/** 配置里的时区无效（拼错）时回退到访客本地时区，并在控制台提示 */
const TIME_ZONE = isValidTimeZone(siteConfig.timeZone) ? siteConfig.timeZone : undefined;
const BUILD_TIME = parseInTimeZone(siteConfig.buildDate || '2026-03-23T00:00:00', TIME_ZONE);

// —— 每秒走一格的时钟：用外部 store 订阅，不在 effect 里同步 setState ——
// 服务端与水合首帧拿到 null（显示占位符），挂载订阅后立即填入真实时间，避免 Hydration 不一致
let clockNow = 0;
function subscribeClock(onTick: () => void) {
  const tick = () => {
    clockNow = Date.now();
    onTick();
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  return () => window.clearInterval(timer);
}
const getClockSnapshot = () => clockNow || null;
const getClockServerSnapshot = () => null;

function describeNow(nowMs: number) {
  const now = new Date(nowMs);
  const { date, weekday } = formatDateParts(now, TIME_ZONE);
  const diff = Math.max(0, nowMs - BUILD_TIME);
  return {
    time: formatClock(now, TIME_ZONE),
    date: `${date} ${weekday}`,
    zone: TIME_ZONE ? `${siteConfig.timeZoneLabel || TIME_ZONE} · ${formatUtcOffset(TIME_ZONE, now)}` : '本地时间',
    uptime: `${Math.floor(diff / 86_400_000)}天 ${Math.floor((diff / 3_600_000) % 24)}小时`,
  };
}

export default function SiteDashboard() {
  const nowMs = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockServerSnapshot);
  const clock = nowMs === null ? null : describeNow(nowMs);
  const weather = useWeather();

  useEffect(() => {
    if (siteConfig.timeZone && !TIME_ZONE) {
      console.warn(`[SiteDashboard] 无效的时区「${siteConfig.timeZone}」，已改用访客本地时间`);
    }
  }, []);

  return (
    // 横向铺满整行的浅色玻璃长条：时钟 | 天气 | 运行状态 · 技术栈 · 备案
    <div className="glass-card flex h-auto flex-col items-stretch overflow-hidden transition-colors duration-700 md:min-h-20 md:flex-row">

      {/* 左侧：时钟（等宽数字）+ 日期 + 时区 */}
      <div className="flex flex-col justify-center border-b border-slate-200/70 px-6 py-4 md:border-b-0 md:border-r md:py-3 dark:border-white/10">
        <span className="font-mono text-2xl font-black leading-none tracking-wider text-slate-900 tabular-nums md:text-[1.75rem] dark:text-white">
          {clock?.time || '--:--:--'}
        </span>
        {/* 日期（按配置的时区），例如「2026年10月7日 星期三」 */}
        <span className="mt-1.5 min-h-[11px] text-[11px] font-bold leading-none tracking-wide text-slate-500 tabular-nums dark:text-slate-400">
          {clock?.date}
        </span>
        {/* 时区标签，例如「新加坡 · UTC+8」 */}
        <span className="mt-1 min-h-[10px] text-[10px] font-bold leading-none tracking-[0.12em] text-indigo-500 dark:text-indigo-400">
          {clock?.zone}
        </span>
      </div>

      {/* 天气（站长所在城市，见 siteConfig.weather）：拿不到时整块不显示 */}
      {weather && <WeatherSegment weather={weather} />}

      {/* 中间与右侧：状态信息 */}
      <div className="flex flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4 text-xs font-bold text-slate-500 md:py-3 md:text-sm dark:text-slate-400">

        {/* 运行时间 */}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden="true"></span>
          <span>系统已稳定运行：<span className="font-black text-indigo-600 tabular-nums dark:text-indigo-400">{clock?.uptime}</span></span>
        </div>

        {/* 技术栈徽章 (🌟 动态映射 siteConfig 里的数组) */}
        <div className="flex flex-wrap gap-2">
          {siteConfig.footerBadges?.map((badge, index) => (
            <span
              key={index}
              className="flex items-center gap-1 rounded-lg border border-white/50 bg-white/60 px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm md:text-xs dark:border-white/10 dark:bg-slate-700/50 dark:text-slate-300"
            >
              <svg className={`h-3.5 w-3.5 ${badge.color}`} fill="currentColor" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: badge.svg }} />
              {badge.name}
            </span>
          ))}
        </div>

        {/* 备案信息 (🌟 从 siteConfig 读取链接和名称) */}
        {/* 没填备案号就不显示 */}
        {siteConfig.icpConfig?.name && (
          <a
            href={siteConfig.icpConfig.link}
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-dashed border-slate-300 pb-0.5 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600 dark:hover:text-indigo-400"
          >
            {siteConfig.icpConfig.name}
          </a>
        )}

      </div>
    </div>
  );
}
/** 时钟右边的天气：图标 + 气温 + 描述，下面一行湿度和今天的温度范围 */
function WeatherSegment({ weather }: { weather: WeatherReport }) {
  const details = [
    weather.humidity !== null ? `湿度 ${weather.humidity}%` : null,
    weather.low !== null && weather.high !== null ? `${weather.low}~${weather.high}°` : null,
    weather.feelsLike !== null && weather.temp !== null && Math.abs(weather.feelsLike - weather.temp) >= 2 ? `体感 ${weather.feelsLike}°` : null,
  ].filter(Boolean);
  return (
    <div
      id="site-weather"
      className="flex items-center gap-3 border-b border-slate-200/70 px-6 py-3 md:border-b-0 md:border-r md:py-0 dark:border-white/10"
      title={weather.source === 'nea' ? '数据来源：新加坡国家环境局（data.gov.sg）' : weather.source === 'open-meteo' ? '数据来源：Open-Meteo' : '天气预览'}
    >
      <WeatherGlyph kind={weather.kind} isDay={isDaytime(TIME_ZONE)} intensity={weather.intensity} className={`h-8 w-8 shrink-0 ${WEATHER_TINT[weather.kind]}`} strokeWidth={1.8} />
      <div className="leading-tight">
        <p className="text-sm font-black text-slate-800 dark:text-slate-100">
          {weather.temp !== null && <span className="mr-1.5 text-xl tabular-nums">{weather.temp}°</span>}
          {weather.text}
        </p>
        <p className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
          {[weather.city, ...details].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}
