// e2e/weather.spec.ts —— 天气：数据解析、首页时间栏、跟着天气变的特效、桌宠 / 命令面板 / 白噪音联动
//
// 测试环境不一定连得上 data.gov.sg，所以浏览器里的 /api/weather 用模拟数据；
// 解析部分直接在 Node 里调用 lib/server/weatherSources.ts，喂给它 v1、v2 两种格式的假响应。
import { test, expect } from './support';
import type { Page } from '@playwright/test';
import { classifyNeaText, classifyWmoCode, isDaytime } from '../lib/weather';
import type { WeatherReport } from '../lib/weather';
import { fetchNea, fetchOpenMeteo } from '../lib/server/weatherSources';

const CONFIG = { city: '新加坡', area: 'City', latitude: 1.2897, longitude: 103.8501 };

const THUNDER: WeatherReport = {
  ok: true, city: '新加坡', kind: 'thunder', intensity: 'heavy', text: '强雷阵雨',
  temp: 27, feelsLike: null, humidity: 91, high: 32, low: 25, updatedAt: new Date().toISOString(), source: 'nea',
};

async function mockWeather(page: Page, body: unknown) {
  await page.route('**/api/weather', (route) => route.fulfill({ json: body }));
}

const raining = (page: Page) => page.evaluate(() => document.querySelectorAll('.weather-rain > span').length);

// —— 数据解析（不开浏览器） ——

test.describe('解析', () => {
  const realFetch = globalThis.fetch;
  const proxyVars = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const;
  const savedProxy: Record<string, string | undefined> = {};

  test.beforeEach(() => {
    // 不走代理，直接用下面替换的 fetch
    for (const k of proxyVars) {
      savedProxy[k] = process.env[k];
      delete process.env[k];
    }
  });
  test.afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of proxyVars) if (savedProxy[k] !== undefined) process.env[k] = savedProxy[k];
  });

  function fakeFetch(responses: Record<string, unknown>) {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const key = Object.keys(responses).find((k) => url.includes(k));
      if (!key) return new Response('not found', { status: 404 });
      return Response.json(responses[key]);
    }) as typeof fetch;
  }

  test('NEA 描述 → 种类、强度、中文', () => {
    expect(classifyNeaText('Heavy Thundery Showers with Gusty Winds')).toEqual({ kind: 'thunder', intensity: 'heavy', text: '强雷阵雨伴阵风' });
    expect(classifyNeaText('Partly Cloudy (Night)')).toEqual({ kind: 'partly', intensity: 'normal', text: '多云' });
    expect(classifyNeaText('Passing Showers')).toMatchObject({ kind: 'rain', intensity: 'light', text: '短时阵雨' });
    expect(classifyNeaText('Slightly Hazy')).toMatchObject({ kind: 'haze', text: '轻度霾' });
    expect(classifyNeaText('Fair (Day)')).toMatchObject({ kind: 'clear', text: '晴' });
    expect(classifyNeaText('Something New')).toMatchObject({ kind: 'cloudy' });
    expect(classifyWmoCode(95)).toMatchObject({ kind: 'thunder' });
    expect(classifyWmoCode(65)).toMatchObject({ kind: 'rain', intensity: 'heavy' });
  });

  test('NEA v2 格式：按区域取预报、取最近的气象站', async () => {
    fakeFetch({
      'two-hr-forecast': { code: 0, data: { area_metadata: [], items: [{ forecasts: [{ area: 'Bedok', forecast: { code: 'FA', text: 'Fair' } }, { area: 'City', forecast: { code: 'TL', text: 'Thundery Showers' } }] }] } },
      'air-temperature': {
        code: 0,
        data: {
          stations: [
            { id: 'S24', name: 'Upper Changi', location: { latitude: 1.37, longitude: 103.98 } },
            { id: 'S108', name: 'Marina Gardens', location: { latitude: 1.2799, longitude: 103.8703 } },
          ],
          readings: [{ timestamp: '2026-10-08T15:00:00+08:00', data: [{ stationId: 'S24', value: 30.1 }, { stationId: 'S108', value: 27.6 }] }],
          readingType: 'DBT 1M F', readingUnit: 'deg C',
        },
      },
      'relative-humidity': { code: 0, data: { stations: [{ id: 'S108', location: { latitude: 1.28, longitude: 103.87 } }], readings: [{ data: [{ stationId: 'S108', value: 88.4 }] }] } },
      'twenty-four-hr-forecast': { code: 0, data: { records: [{ general: { temperature: { low: 25, high: 33, unit: 'Degrees Celsius' }, forecast: { code: 'TL', text: 'Thundery Showers' } } }] } },
    });
    const r = await fetchNea(CONFIG);
    expect(r).toMatchObject({ kind: 'thunder', text: '雷阵雨', temp: 28, humidity: 88, high: 33, low: 25, source: 'nea' });
  });

  test('NEA v1 格式（蛇形字段）也能解析；区域名对不上时取全岛最常见的预报', async () => {
    fakeFetch({
      'two-hr-forecast': { items: [{ forecasts: [{ area: 'Ang Mo Kio', forecast: 'Light Rain' }, { area: 'Bishan', forecast: 'Light Rain' }, { area: 'Tuas', forecast: 'Cloudy' }] }] },
      'air-temperature': { metadata: { stations: [{ id: 'S50', location: { latitude: 1.33, longitude: 103.77 } }] }, items: [{ readings: [{ station_id: 'S50', value: 29.2 }] }] },
      'relative-humidity': { metadata: { stations: [] }, items: [{ readings: [{ station_id: 'S50', value: 70 }] }] },
      'twenty-four-hr-forecast': { items: [{ general: { temperature: { low: 24, high: 31 }, forecast: 'Thundery Showers' } }] },
    });
    const r = await fetchNea({ ...CONFIG, area: 'No Such Area' });
    expect(r).toMatchObject({ kind: 'rain', intensity: 'light', text: '小雨', temp: 29, humidity: 70, high: 31, low: 24 });
  });

  test('NEA 只拿到预报时，其余项留空；预报都拿不到时报错（交给 Open-Meteo）', async () => {
    fakeFetch({ 'two-hr-forecast': { data: { items: [{ forecasts: [{ area: 'City', forecast: 'Hazy' }] }] } } });
    expect(await fetchNea(CONFIG)).toMatchObject({ kind: 'haze', temp: null, humidity: null, high: null, low: null });
    fakeFetch({});
    await expect(fetchNea(CONFIG)).rejects.toThrow(/两小时预报/);
  });

  test('Open-Meteo 备用', async () => {
    fakeFetch({
      'api.open-meteo.com': {
        current: { temperature_2m: 30.6, relative_humidity_2m: 74, apparent_temperature: 36.2, weather_code: 2 },
        daily: { temperature_2m_max: [32.4], temperature_2m_min: [25.1] },
      },
    });
    expect(await fetchOpenMeteo(CONFIG, 'Asia/Singapore')).toMatchObject({ kind: 'partly', text: '多云', temp: 31, feelsLike: 36, humidity: 74, high: 32, low: 25, source: 'open-meteo' });
  });
});

// —— 页面 ——

test('接口本身：总是返回 JSON（离线构建时为 ok: false）', async ({ request }) => {
  const res = await request.get('/api/weather');
  expect(res.ok()).toBe(true);
  expect(typeof (await res.json()).ok).toBe('boolean');
});

test.describe('首页与联动', () => {
  test.use({ effects: 'full' });

  test('时间栏显示天气；命令面板、白噪音都知道在下雨；背景下雨', async ({ page }) => {
    await mockWeather(page, THUNDER);
    await page.goto('/');
    const segment = page.locator('#site-weather');
    await expect(segment).toContainText('27°');
    await expect(segment).toContainText('强雷阵雨');
    await expect(segment).toContainText('新加坡 · 湿度 91% · 25~32°');
    await expect(segment).toHaveAttribute('title', /data\.gov\.sg/);

    await expect.poll(() => raining(page)).toBeGreaterThan(50);
    expect(await page.locator('.weather-veil-rain').count()).toBe(1);

    await page.keyboard.press('Control+k');
    await page.keyboard.type('天气');
    await expect(page.locator('[role="option"][aria-selected="true"]')).toContainText('新加坡 27° 强雷阵雨');
    await page.keyboard.press('Escape');

    await page.locator('div.fixed.bottom-6.left-6 > button').last().click();
    await page.getByRole('button', { name: /白噪音/ }).first().click();
    await expect(page.getByText('新加坡窗外正在下雨')).toBeVisible();
  });

  test('雷雨时偶尔闪电', async ({ page }) => {
    test.setTimeout(60_000);
    await mockWeather(page, THUNDER);
    await page.goto('/');
    await expect(page.locator('.weather-flash')).toHaveCount(1, { timeout: 20_000 });
  });

  test('桌宠说一句天气（每次浏览一次）', async ({ page }) => {
    await mockWeather(page, THUNDER);
    await page.goto('/');
    await expect(page.locator('p[role="status"]', { hasText: /打雷/ })).toBeVisible({ timeout: 12_000 });
    expect(await page.evaluate(() => sessionStorage.getItem('pet-weather'))).toBe('1');
  });

  test('拿不到天气：时间栏和特效都不显示', async ({ page }) => {
    await mockWeather(page, { ok: false, reason: 'unavailable' });
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.locator('#site-weather')).toHaveCount(0);
    await expect(page.locator('.weather-layer')).toHaveCount(0);
  });
});

test.describe('特效档位', () => {
  test.describe('简洁档', () => {
    test.use({ effects: 'lite' });
    test('雨丝减少，不闪电', async ({ page }) => {
      await mockWeather(page, THUNDER);
      await page.goto('/');
      await expect.poll(() => raining(page)).toBeGreaterThan(0);
      expect(await raining(page)).toBeLessThanOrEqual(50);
      await page.waitForTimeout(17_000);
      await expect(page.locator('.weather-flash')).toHaveCount(0);
    });
  });

  test.describe('阅读档', () => {
    test.use({ effects: 'off' });
    test('没有天气特效，时间栏照常显示', async ({ page }) => {
      await mockWeather(page, THUNDER);
      await page.goto('/');
      await expect(page.locator('#site-weather')).toContainText('强雷阵雨');
      await expect(page.locator('.weather-layer')).toHaveCount(0);
    });
  });
});

test.describe('预览（?weather=）', () => {
  test.use({ effects: 'full' });

  for (const [kind, selector] of [['fog', '.weather-veil-fog'], ['haze', '.weather-veil-haze'], ['cloudy', '.weather-veil-cloudy'], ['rain', '.weather-rain']] as const) {
    test(`${kind}`, async ({ page }) => {
      await mockWeather(page, { ok: false, reason: 'unavailable' });
      await page.goto(`/?weather=${kind}`);
      await expect(page.locator(selector)).toHaveCount(1);
      await expect(page.locator('#site-weather')).toBeVisible();
    });
  }

  test('晴天：白天有暖光，晚上没有', async ({ page }) => {
    await page.goto('/?weather=clear');
    await expect(page.locator('#site-weather')).toBeVisible();
    await expect(page.locator('.weather-sun')).toHaveCount(isDaytime('Asia/Singapore') ? 1 : 0);
  });

  test('下雪：飘雪花', async ({ page }) => {
    await page.goto('/?weather=snow');
    // 雪花在前景层（卡片前面）
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('[class*="z-[53]"] use')].some((u) => (u.getAttribute('href') || '').includes('flake')))).toBe(true);
  });
});
