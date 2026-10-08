"use client";

import { useEffect, useState } from 'react';
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

export default function SiteDashboard() {
  // 首帧（含服务端渲染）显示占位符，挂载后再填入真实时间，避免 Hydration 不一致
  const [timeStr, setTimeStr] = useState('');
  const [zoneLabel, setZoneLabel] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [uptimeStr, setUptimeStr] = useState('');
  const weather = useWeather();

  useEffect(() => {
    if (siteConfig.timeZone && !TIME_ZONE) {
      console.warn(`[SiteDashboard] 无效的时区「${siteConfig.timeZone}」，已改用访客本地时间`);
    }

    const updateTime = () => {
      const now = new Date();
      setTimeStr(formatClock(now, TIME_ZONE));
      const { date, weekday } = formatDateParts(now, TIME_ZONE);
      setDateStr(`${date} ${weekday}`);
      setZoneLabel(TIME_ZONE ? `${siteConfig.timeZoneLabel || TIME_ZONE} · ${formatUtcOffset(TIME_ZONE, now)}` : '本地时间');

      const diff = Math.max(0, now.getTime() - BUILD_TIME);
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff / 3_600_000) % 24);
      setUptimeStr(`${days}天 ${hours}小时`);
    };

    updateTime();
    const timer = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    // 横向铺满 12 列的长条矩阵
    <div className="glass-card md:col-span-12 overflow-hidden flex flex-col md:flex-row items-stretch transition-colors duration-700 h-auto md:h-20 group">

      {/* 左侧：翻页时钟特效 (使用等宽字体) */}
      <div className="bg-slate-900 dark:bg-black text-white px-8 py-4 md:py-0 flex flex-col items-center justify-center shadow-inner relative overflow-hidden group-hover:text-indigo-400 transition-colors duration-300">
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
        <span className="relative font-mono text-2xl md:text-3xl font-black tracking-widest tabular-nums leading-none">
          {timeStr || '--:--:--'}
          {/* 模拟翻页中间的分割线 */}
          <span className="absolute left-0 right-0 top-1/2 h-px bg-black/50" aria-hidden="true"></span>
        </span>
        {/* 日期（按配置的时区），例如「2026年10月7日 星期三」 */}
        <span className="relative mt-1.5 text-[11px] font-bold tracking-[0.12em] text-white/80 leading-none min-h-[11px] tabular-nums">
          {dateStr}
        </span>
        {/* 时区标签，例如「新加坡 · UTC+8」 */}
        <span className="relative mt-1 text-[10px] font-bold tracking-[0.2em] text-white/50 leading-none min-h-[10px]">
          {zoneLabel}
        </span>
      </div>

      {/* 天气（站长所在城市，见 siteConfig.weather）：拿不到时整块不显示 */}
      {weather && <WeatherSegment weather={weather} />}

      {/* 中间与右侧：状态信息 */}
      <div className="flex-1 px-6 py-4 md:py-0 flex flex-wrap items-center justify-between gap-4 text-xs md:text-sm font-bold text-slate-600 dark:text-slate-300">

        {/* 运行时间 */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span>系统已稳定运行：<span className="text-indigo-600 dark:text-indigo-400 font-black">{uptimeStr}</span></span>
        </div>

        {/* 技术栈徽章 (🌟 动态映射 siteConfig 里的数组) */}
        <div className="flex gap-2">
          {siteConfig.footerBadges?.map((badge, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-white/50 dark:bg-slate-700/50 rounded-md shadow-sm flex items-center gap-1 border border-white/40 dark:border-slate-600"
            >
              <svg className={`w-3.5 h-3.5 ${badge.color}`} fill="currentColor" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: badge.svg }} />
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
            className="hover:text-indigo-500 transition-colors border-b border-dashed border-slate-400 dark:border-slate-500 pb-0.5"
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
      className="flex items-center gap-3 border-b border-white/30 px-6 py-3 md:border-b-0 md:border-r md:py-0 dark:border-white/10"
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
