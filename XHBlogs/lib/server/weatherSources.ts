// lib/server/weatherSources.ts —— 从公开接口取天气（仅服务端，由 app/api/weather/route.ts 调用）
//
// 1. 新加坡国家环境局（NEA）在 data.gov.sg 的实时接口，不用注册：
//    - two-hr-forecast：各区域两小时预报（「Thundery Showers」之类）→ 天气种类
//    - air-temperature / relative-humidity：各气象站实时读数 → 取离配置坐标最近的站
//    - twenty-four-hr-forecast：今天的最高 / 最低温
//    可选在环境变量 DATA_GOV_SG_API_KEY 填 data.gov.sg 的 API Key，提高请求频率上限（每 20 分钟才请求一轮，一般用不到）
// 2. 备用：Open-Meteo（全球城市，不用注册）
//
// 接口返回的字段名在不同版本间有过变化（v1 / v2、蛇形 / 驼峰），解析时都兼容；哪一项拿不到就留空，不影响其他项。
import { isProxyConfigured, outboundFetch } from './outboundFetch';
import { classifyNeaText, classifyWmoCode } from '../weather';
import type { WeatherReport } from '../weather';

export interface WeatherConfig {
  city: string;
  area: string;
  latitude: number;
  longitude: number;
}

const NEA_BASE = 'https://api-open.data.gov.sg/v2/real-time/api';
const TIMEOUT_MS = 8000;

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asNum = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function getJson(url: string, headers: Record<string, string> = {}): Promise<Json> {
  const init = { headers: { Accept: 'application/json', 'User-Agent': 'XHBlogs-weather/1.0', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  // 配了代理（国内本地预览）就走代理；否则用普通 fetch。整个接口已经按 20 分钟缓存，这里不再单独缓存
  const res = isProxyConfigured() ? await outboundFetch(url, init) : await fetch(url, { ...init, next: { revalidate: 1200 } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} 返回 ${res.status}`);
  const json = asObj(await res.json());
  if (!json) throw new Error('返回的不是 JSON 对象');
  return json;
}

/** v2 把内容包在 data 里，v1 直接放在顶层 */
const payload = (json: Json): Json => asObj(json.data) ?? json;

function distance(aLat: number, aLon: number, bLat: number, bLon: number): number {
  return (aLat - bLat) ** 2 + (aLon - bLon) ** 2;
}

// —— NEA ——

async function neaForecast(area: string, headers: Record<string, string>): Promise<string | null> {
  const data = payload(await getJson(`${NEA_BASE}/two-hr-forecast`, headers));
  const item = asObj(asArr(data.items)[0]);
  const forecasts = asArr(item?.forecasts).map(asObj).filter((f): f is Json => f !== null);
  const textOf = (f: Json) => asStr(f.forecast) ?? asStr(asObj(f.forecast)?.text);
  const target = area.trim().toLowerCase();
  const match = forecasts.find((f) => asStr(f.area)?.toLowerCase() === target);
  if (match) return textOf(match);
  // 区域名对不上（拼错或接口改名）：取全岛最常见的预报
  const counts = new Map<string, number>();
  for (const f of forecasts) {
    const t = textOf(f);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** 气温 / 湿度这类「各站读数」：取离 (lat, lon) 最近、且有读数的站 */
async function neaNearestReading(endpoint: string, lat: number, lon: number, headers: Record<string, string>): Promise<number | null> {
  const data = payload(await getJson(`${NEA_BASE}/${endpoint}`, headers));
  // 站点：v2 在 data.stations，v1 在 metadata.stations
  const stations = asArr(data.stations ?? asObj(data.metadata)?.stations)
    .map(asObj)
    .filter((s): s is Json => s !== null)
    .map((s) => {
      const loc = asObj(s.location) ?? asObj(s.labelLocation) ?? asObj(s.label_location);
      return { id: asStr(s.id) ?? asStr(s.stationId), lat: asNum(loc?.latitude), lon: asNum(loc?.longitude) };
    });
  // 读数：v2 是 readings[0].data[{stationId, value}]，v1 是 items[0].readings[{station_id, value}]
  const v2 = asObj(asArr(data.readings)[0]);
  const rows = v2 ? asArr(v2.data) : asArr(asObj(asArr(data.items)[0])?.readings);
  const values = new Map<string, number>();
  for (const row of rows.map(asObj)) {
    const id = asStr(row?.stationId) ?? asStr(row?.station_id);
    const value = asNum(row?.value);
    if (id && value !== null) values.set(id, value);
  }
  if (values.size === 0) return null;
  let best: { d: number; value: number } | null = null;
  for (const s of stations) {
    const value = s.id ? values.get(s.id) : undefined;
    if (value === undefined || s.lat === null || s.lon === null) continue;
    const d = distance(lat, lon, s.lat, s.lon);
    if (!best || d < best.d) best = { d, value };
  }
  if (best) return best.value;
  // 没有坐标信息：取平均
  const all = [...values.values()];
  return all.reduce((sum, v) => sum + v, 0) / all.length;
}

async function neaDailyRange(headers: Record<string, string>): Promise<{ high: number | null; low: number | null }> {
  const data = payload(await getJson(`${NEA_BASE}/twenty-four-hr-forecast`, headers));
  const record = asObj(asArr(data.records)[0]) ?? asObj(asArr(data.items)[0]);
  const temperature = asObj(asObj(record?.general)?.temperature);
  return { high: asNum(temperature?.high), low: asNum(temperature?.low) };
}

export async function fetchNea(config: WeatherConfig): Promise<WeatherReport> {
  const key = process.env.DATA_GOV_SG_API_KEY?.trim();
  const headers: Record<string, string> = key ? { 'x-api-key': key } : {};
  const [forecast, temp, humidity, range] = await Promise.allSettled([
    neaForecast(config.area, headers),
    neaNearestReading('air-temperature', config.latitude, config.longitude, headers),
    neaNearestReading('relative-humidity', config.latitude, config.longitude, headers),
    neaDailyRange(headers),
  ]);
  const text = forecast.status === 'fulfilled' ? forecast.value : null;
  if (!text) throw new Error(`NEA 两小时预报不可用：${forecast.status === 'rejected' ? String(forecast.reason) : '没有数据'}`);
  const classified = classifyNeaText(text);
  const value = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);
  return {
    ok: true,
    city: config.city,
    ...classified,
    temp: round(value(temp)),
    feelsLike: null,
    humidity: round(value(humidity)),
    high: round(value(range)?.high ?? null),
    low: round(value(range)?.low ?? null),
    updatedAt: new Date().toISOString(),
    source: 'nea',
  };
}

// —— Open-Meteo ——

export async function fetchOpenMeteo(config: WeatherConfig, timeZone: string): Promise<WeatherReport> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(config.latitude));
  url.searchParams.set('longitude', String(config.longitude));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', timeZone || 'auto');
  url.searchParams.set('forecast_days', '1');
  const json = await getJson(url.toString());
  const current = asObj(json.current);
  const daily = asObj(json.daily);
  const code = asNum(current?.weather_code);
  if (!current || code === null) throw new Error('Open-Meteo 没有当前天气');
  return {
    ok: true,
    city: config.city,
    ...classifyWmoCode(code),
    temp: round(asNum(current.temperature_2m)),
    feelsLike: round(asNum(current.apparent_temperature)),
    humidity: round(asNum(current.relative_humidity_2m)),
    high: round(asNum(asArr(daily?.temperature_2m_max)[0])),
    low: round(asNum(asArr(daily?.temperature_2m_min)[0])),
    updatedAt: new Date().toISOString(),
    source: 'open-meteo',
  };
}

function round(n: number | null): number | null {
  return n === null ? null : Math.round(n);
}
