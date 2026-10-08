// lib/imageMeta.ts —— 构建时生成的图片信息（主色调、模糊缩略图），由 scripts/build-image-meta.mjs 产出
//
// 只收录 public/images/ 下的本地图片；外链图片查不到，调用方按「没有信息」处理即可。
import data from './generated/image-meta.json';

export interface ImageMeta {
  w: number;
  h: number;
  /** 最鲜艳的色相（OKLCH 色相角 0~360）；几乎无彩色的图没有 */
  hue?: number;
  /** 8px 宽的模糊缩略图 data URL；带透明通道的图没有 */
  blur?: string;
}

const META = data as Record<string, ImageMeta>;

export function getImageMeta(src: string | null | undefined): ImageMeta | undefined {
  if (!src || !src.startsWith('/')) return undefined;
  const path = src.split(/[?#]/)[0];
  if (META[path]) return META[path];
  try {
    return META[decodeURI(path)];
  } catch {
    return undefined;
  }
}

// ============================== 强调色 ==============================

/** Tailwind 原本 indigo-500 的色相：没有背景图、或背景图几乎无彩色时用它 */
export const DEFAULT_ACCENT_HUE = 277;

/**
 * 强调色只在「青 → 蓝 → 紫 → 粉 → 玫红」这一段里取（195° ~ 375°，即 15°），
 * 黄绿橙一类的色相做按钮底色时白字看不清，落在外面就贴到最近的一端。
 */
const ARC_START = 195;
const ARC_END = 375;

export function toAccentHue(hue: number | undefined): number {
  if (hue === undefined) return DEFAULT_ACCENT_HUE;
  const h = ((hue % 360) + 360) % 360;
  if (h >= ARC_START) return h;
  if (h + 360 <= ARC_END) return h + 360;
  return h - (ARC_END - 360) < ARC_START - h ? ARC_END : ARC_START;
}
