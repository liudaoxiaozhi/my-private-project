// lib/site.ts —— 站点绝对地址（仅服务端 / 构建期使用）
//
// 用于 sitemap、robots 与 metadataBase（OG 分享卡片里的相对图片地址需要它补全域名）。
// 优先级：环境变量 SITE_URL → public/CNAME（自定义域名）→ Vercel 生产域名 → 本地开发地址
import fs from 'fs';
import path from 'path';

function normalize(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.origin;
  } catch {
    return null;
  }
}

function readCname(): string | null {
  try {
    const first = fs.readFileSync(path.join(process.cwd(), 'public', 'CNAME'), 'utf8').split(/\r?\n/)[0] ?? '';
    return normalize(first);
  } catch {
    return null;
  }
}

function resolveSiteUrl(): string {
  return (
    normalize(process.env.SITE_URL ?? '') ??
    readCname() ??
    normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '') ??
    `http://localhost:${process.env.PORT ?? '3000'}`
  );
}

/** 例如 "https://www.xinghuisama.top"（无结尾斜杠） */
export const SITE_URL: string = resolveSiteUrl();

/** 拼接站内绝对地址 */
export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}
