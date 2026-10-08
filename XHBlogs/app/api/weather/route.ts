// app/api/weather/route.ts —— 站长所在城市的当前天气（配置见 siteConfig.weather，数据源见 lib/server/weatherSources.ts）
//
// 整个接口每 20 分钟在服务器上更新一次（增量静态再生成），访客的浏览器只读缓存，不会直接请求天气网站。
// 更新失败时：构建阶段返回 { ok: false }（首页不显示天气）；运行中失败则抛错，Next.js 会继续用上一份成功的数据。
import { siteConfig } from '../../../siteConfig';
import { fetchNea, fetchOpenMeteo } from '../../../lib/server/weatherSources';
import type { WeatherResponse } from '../../../lib/weather';

export const revalidate = 1200;

export async function GET() {
  const config = siteConfig.weather;
  if (!config?.enabled) return Response.json({ ok: false, reason: 'disabled' } satisfies WeatherResponse);

  const errors: string[] = [];
  // 配了新加坡的区域名就先用 NEA，拿不到再用 Open-Meteo
  if (config.area) {
    try {
      return Response.json((await fetchNea(config)) satisfies WeatherResponse);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  try {
    return Response.json((await fetchOpenMeteo(config, siteConfig.timeZone)) satisfies WeatherResponse);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  console.warn(`[weather] 天气获取失败：${errors.join('；')}`);
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return Response.json({ ok: false, reason: 'unavailable' } satisfies WeatherResponse);
  }
  throw new Error(`天气获取失败：${errors.join('；')}`);
}
