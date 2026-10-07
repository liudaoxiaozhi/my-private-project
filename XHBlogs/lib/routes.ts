// lib/routes.ts —— 路由判断（客户端 / 服务端通用）

/**
 * 沉浸阅读页：小说章节 /novel/<书>/<卷>/<章> 与本地 EPUB 阅读器 /novel/epub。
 * 这些页面不显示悬浮播放器、桌宠、樱花、工具箱等全站浮层。
 */
export function isReaderPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname && (/^\/novel\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname) || /^\/novel\/epub\/?$/.test(pathname)));
}
