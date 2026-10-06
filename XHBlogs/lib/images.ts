// lib/images.ts —— 图片优化白名单（客户端 / 服务端通用）
//
// 只有这些来源会经过 Next.js 图片优化（自动转 WebP/AVIF、按屏幕宽度裁尺寸）。
// 其他来源（友链头像、网易云封面等任意外链）走 unoptimized 直出，避免未配置域名时 next/image 报错。
// ⚠️ 修改这里时，请同步修改 next.config.ts 里的 images.remotePatterns。
export const OPTIMIZED_IMAGE_HOSTS: readonly string[] = ['bu.dusays.com', 'images.unsplash.com'];

/** GIF 动图与 SVG 矢量图不需要（也不适合）走位图优化 */
const SKIP_EXTENSIONS = /\.(gif|svg)(\?|#|$)/i;

export function isOptimizableSrc(src: string): boolean {
  if (SKIP_EXTENSIONS.test(src)) return false;
  // 站内 public/ 资源
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && OPTIMIZED_IMAGE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}
