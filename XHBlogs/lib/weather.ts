// lib/weather.ts —— 天气：数据格式、天气种类、中文描述（服务端接口和浏览器端共用，不能引用 Node 专用模块）
//
// 数据由 app/api/weather/route.ts 在服务器上获取并缓存 20 分钟：
// - 主数据源：新加坡国家环境局（NEA）在 data.gov.sg 上的公开实时接口（两小时预报、气温、湿度、24 小时预报）
// - 备用：Open-Meteo（NEA 拿不到，或者 siteConfig.weather.area 留空、显示的不是新加坡时）
// 浏览器端用 useWeather() 读取（见 lib/useWeather.ts）。

/** 天气种类：决定图标、特效和桌宠台词 */
export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'rain' | 'thunder' | 'haze' | 'fog' | 'windy' | 'snow';
export type WeatherIntensity = 'light' | 'normal' | 'heavy';

export interface WeatherReport {
  ok: true;
  city: string;
  kind: WeatherKind;
  intensity: WeatherIntensity;
  /** 中文描述，如「雷阵雨」 */
  text: string;
  /** 当前气温 / 体感温度 / 湿度（%）/ 今天最高、最低温，拿不到时为 null */
  temp: number | null;
  feelsLike: number | null;
  humidity: number | null;
  high: number | null;
  low: number | null;
  /** 数据更新时间（ISO 字符串） */
  updatedAt: string;
  source: 'nea' | 'open-meteo' | 'preview';
}

export type WeatherResponse = WeatherReport | { ok: false; reason: string };

export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'partly', 'cloudy', 'rain', 'thunder', 'haze', 'fog', 'windy', 'snow'];

/** 每种天气的默认中文名（预览、或者原文没有对应译名时用） */
export const KIND_LABEL: Record<WeatherKind, string> = {
  clear: '晴',
  partly: '多云',
  cloudy: '阴',
  rain: '雨',
  thunder: '雷阵雨',
  haze: '有霾',
  fog: '雾',
  windy: '有风',
  snow: '雪',
};

// —— NEA 的英文描述 → 中文 ——

const NEA_TEXT: Record<string, string> = {
  'fair': '晴',
  'fair and warm': '晴热',
  'sunny': '晴',
  'partly cloudy': '多云',
  'cloudy': '阴',
  'overcast': '阴',
  'hazy': '有霾',
  'slightly hazy': '轻度霾',
  'windy': '有风',
  'strong winds': '大风',
  'mist': '薄雾',
  'fog': '雾',
  'drizzle': '毛毛雨',
  'light rain': '小雨',
  'moderate rain': '中雨',
  'heavy rain': '大雨',
  'passing showers': '短时阵雨',
  'light showers': '小阵雨',
  'showers': '阵雨',
  'heavy showers': '强阵雨',
  'thundery showers': '雷阵雨',
  'heavy thundery showers': '强雷阵雨',
  'heavy thundery showers with gusty winds': '强雷阵雨伴阵风',
  'snow': '雪',
};

/** 去掉「(Day)」「(Night)」之类的后缀，统一小写 */
function normalize(text: string): string {
  return text.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** NEA 的天气描述（如「Heavy Thundery Showers」）→ 种类 + 强度 + 中文 */
export function classifyNeaText(raw: string): { kind: WeatherKind; intensity: WeatherIntensity; text: string } {
  const t = normalize(raw);
  const intensity: WeatherIntensity = /heavy|strong/.test(t) ? 'heavy' : /light|passing|slight|drizzle/.test(t) ? 'light' : 'normal';
  let kind: WeatherKind;
  if (/thunder/.test(t)) kind = 'thunder';
  else if (/snow/.test(t)) kind = 'snow';
  else if (/rain|shower|drizzle/.test(t)) kind = 'rain';
  else if (/fog|mist/.test(t)) kind = 'fog';
  else if (/haz/.test(t)) kind = 'haze';
  else if (/wind/.test(t)) kind = 'windy';
  else if (/partly/.test(t)) kind = 'partly';
  else if (/cloud|overcast/.test(t)) kind = 'cloudy';
  else if (/fair|sunny|clear|warm/.test(t)) kind = 'clear';
  else kind = 'cloudy';
  return { kind, intensity, text: NEA_TEXT[t] ?? KIND_LABEL[kind] };
}

// —— Open-Meteo 的 WMO 天气代码 → 种类 + 强度 + 中文 ——

export function classifyWmoCode(code: number): { kind: WeatherKind; intensity: WeatherIntensity; text: string } {
  const pick = (kind: WeatherKind, text: string, intensity: WeatherIntensity = 'normal') => ({ kind, intensity, text });
  switch (code) {
    case 0: return pick('clear', '晴');
    case 1: return pick('clear', '晴间少云');
    case 2: return pick('partly', '多云');
    case 3: return pick('cloudy', '阴');
    case 45: case 48: return pick('fog', '雾');
    case 51: case 53: case 55: return pick('rain', '毛毛雨', 'light');
    case 56: case 57: return pick('rain', '冻毛毛雨', 'light');
    case 61: return pick('rain', '小雨', 'light');
    case 63: return pick('rain', '中雨');
    case 65: return pick('rain', '大雨', 'heavy');
    case 66: case 67: return pick('rain', '冻雨');
    case 71: return pick('snow', '小雪', 'light');
    case 73: return pick('snow', '中雪');
    case 75: return pick('snow', '大雪', 'heavy');
    case 77: return pick('snow', '米雪', 'light');
    case 80: return pick('rain', '小阵雨', 'light');
    case 81: return pick('rain', '阵雨');
    case 82: return pick('rain', '强阵雨', 'heavy');
    case 85: case 86: return pick('snow', '阵雪');
    case 95: return pick('thunder', '雷阵雨');
    case 96: case 99: return pick('thunder', '雷阵雨伴冰雹', 'heavy');
    default: return pick('cloudy', '阴');
  }
}

/** 某个时区此刻是不是白天（按 7:00～19:00 粗略判断，新加坡全年日出日落都在这附近） */
export function isDaytime(timeZone?: string, now: Date = new Date()): boolean {
  let hour = now.getHours();
  if (timeZone) {
    try {
      hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
    } catch {
      /* 时区无效时按本地时间 */
    }
  }
  return hour >= 7 && hour < 19;
}

/** 网址里的 ?weather=rain 之类：预览某种天气（不管真实天气如何），方便看效果 */
export function previewKind(search: string): WeatherKind | null {
  const value = new URLSearchParams(search).get('weather');
  return value && (WEATHER_KINDS as readonly string[]).includes(value) ? (value as WeatherKind) : null;
}

export function previewReport(kind: WeatherKind, city: string): WeatherReport {
  const hot = kind === 'clear' || kind === 'partly';
  return {
    ok: true,
    city,
    kind,
    intensity: kind === 'thunder' ? 'heavy' : 'normal',
    text: KIND_LABEL[kind],
    temp: kind === 'snow' ? -2 : hot ? 32 : 27,
    feelsLike: null,
    humidity: hot ? 65 : 88,
    high: kind === 'snow' ? 1 : 33,
    low: kind === 'snow' ? -5 : 25,
    updatedAt: new Date().toISOString(),
    source: 'preview',
  };
}
