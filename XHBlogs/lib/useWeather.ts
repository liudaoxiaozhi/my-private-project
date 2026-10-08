"use client";
// lib/useWeather.ts —— 浏览器端读取天气：全站共用一份，同一标签页 10 分钟内不重复请求
//
// - 首页时间栏、天气特效、桌宠、命令面板、白噪音都用 useWeather()，只发一次请求
// - 网址加 ?weather=rain（或 thunder / cloudy / fog / haze / clear / snow …）可以预览某种天气
// - 拿不到天气时返回 null，各处直接不显示
import { useEffect, useSyncExternalStore } from 'react';
import { previewKind, previewReport } from './weather';
import type { WeatherReport, WeatherResponse } from './weather';
import { siteConfig } from '../siteConfig';

const CACHE_KEY = 'weather-cache';
const CACHE_MS = 10 * 60_000;

let current: WeatherReport | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(report: WeatherReport | null) {
  current = report;
  listeners.forEach((l) => l());
}

function readCache(): WeatherReport | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null') as { at: number; report: WeatherReport } | null;
    return cached && Date.now() - cached.at < CACHE_MS ? cached.report : null;
  } catch {
    return null;
  }
}

function load(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const preview = previewKind(window.location.search);
    if (preview) return set(previewReport(preview, siteConfig.weather?.city || ''));
    if (!siteConfig.weather?.enabled) return;
    const cached = readCache();
    if (cached) return set(cached);
    try {
      const res = await fetch('/api/weather');
      const data = (await res.json()) as WeatherResponse;
      if (!data.ok) return;
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), report: data }));
      } catch {
        /* 存不下就每次都请求 */
      }
      set(data);
    } catch {
      /* 拿不到就不显示 */
    }
  })();
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 当前天气；还没拿到或拿不到时为 null */
export function useWeather(): WeatherReport | null {
  const report = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => {
    void load();
  }, []);
  return report;
}
