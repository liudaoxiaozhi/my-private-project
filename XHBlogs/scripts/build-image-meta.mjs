#!/usr/bin/env node
// scripts/build-image-meta.mjs —— 扫描 public/images/，为每张图生成「主色调 + 模糊缩略图」
//
// 在 `npm run dev` / `npm run build` 前自动执行（见 package.json），输出 lib/generated/image-meta.json：
//   "/images/bg/bg-madoka.webp": { "w": 1920, "h": 1080, "hue": 330.5, "blur": "data:image/webp;base64,..." }
//
// - hue：图里最鲜艳的色相（OKLCH 色相角）。背景轮播时，全站强调色跟着当前背景变（见 BackgroundSlider）
// - blur：8px 宽的模糊缩略图，图片加载完成前先显示它，代替灰色色块（见 AppImage）
//   带透明通道的图（桌宠、开屏横幅等）不生成 blur，避免透明处先糊一片
//
// 依赖 Next.js 自带的 sharp。万一当前环境装不上 sharp，保留已有的 JSON 并跳过，不影响构建。
import fs from 'node:fs';
import path from 'node:path';

const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const OUTPUT = path.join(process.cwd(), 'lib', 'generated', 'image-meta.json');
const IMAGE_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg', '.avif']);

const BLUR_WIDTH = 8;
const SAMPLE_SIZE = 48;
const HUE_BINS = 36;

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('🖼️  未找到 sharp，跳过图片取色（沿用已有的 lib/generated/image-meta.json）');
  process.exit(0);
}

function listImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listImages(full);
    return IMAGE_EXT.has(path.extname(entry.name).toLowerCase()) ? [full] : [];
  });
}

/** sRGB(0~255) → OKLab，返回 [L, a, b] */
function toOklab(r, g, b) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * 找「最有代表性的鲜艳色相」：按色相分桶，每个像素按彩度加权（太暗、太亮的像素权重降低），
 * 取权重最大的桶，再在桶内求加权平均色相。几乎没有颜色的图返回 null。
 */
function dominantHue(pixels, channels) {
  const weights = new Float64Array(HUE_BINS);
  const sinSum = new Float64Array(HUE_BINS);
  const cosSum = new Float64Array(HUE_BINS);
  for (let i = 0; i < pixels.length; i += channels) {
    if (channels === 4 && pixels[i + 3] < 128) continue;
    const [L, a, b] = toOklab(pixels[i], pixels[i + 1], pixels[i + 2]);
    const chroma = Math.hypot(a, b);
    if (chroma < 0.03) continue;
    const lightness = 1 - Math.abs(L - 0.65) * 1.6;
    const weight = chroma * Math.max(0.1, lightness);
    const angle = Math.atan2(b, a);
    const hue = ((angle * 180) / Math.PI + 360) % 360;
    const bin = Math.floor(hue / (360 / HUE_BINS)) % HUE_BINS;
    weights[bin] += weight;
    sinSum[bin] += Math.sin(angle) * weight;
    cosSum[bin] += Math.cos(angle) * weight;
  }
  // 相邻桶平滑一下，避免一种颜色正好落在两个桶的边界上被拆散
  let best = -1;
  let bestWeight = 0;
  for (let i = 0; i < HUE_BINS; i++) {
    const w = weights[(i + HUE_BINS - 1) % HUE_BINS] * 0.5 + weights[i] + weights[(i + 1) % HUE_BINS] * 0.5;
    if (w > bestWeight) {
      bestWeight = w;
      best = i;
    }
  }
  if (best === -1) return null;
  const angle = Math.atan2(sinSum[best], cosSum[best]);
  return Math.round((((angle * 180) / Math.PI + 360) % 360) * 10) / 10;
}

async function describe(file) {
  const image = sharp(file);
  const { width, height, hasAlpha } = await image.metadata();
  const { data, info } = await sharp(file).resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const meta = { w: width, h: height };
  const hue = dominantHue(data, info.channels);
  if (hue !== null) meta.hue = hue;
  if (!hasAlpha) {
    const blur = await sharp(file).resize(BLUR_WIDTH).webp({ quality: 40 }).toBuffer();
    meta.blur = `data:image/webp;base64,${blur.toString('base64')}`;
  }
  return meta;
}

const files = listImages(IMAGES_DIR).sort();
const result = {};
for (const file of files) {
  const url = '/' + path.relative(path.join(process.cwd(), 'public'), file).split(path.sep).join('/');
  try {
    result[url] = await describe(file);
  } catch (error) {
    console.warn(`🖼️  无法读取 ${url}：${error.message}`);
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const json = JSON.stringify(result, null, 1) + '\n';
// 内容没变就不写，避免每次构建都改动文件时间
if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== json) fs.writeFileSync(OUTPUT, json);
console.log(`🖼️  图片取色：${Object.keys(result).length} 张 → lib/generated/image-meta.json`);
