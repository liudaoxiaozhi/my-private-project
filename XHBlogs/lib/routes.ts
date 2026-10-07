// lib/routes.ts —— 路由判断（客户端 / 服务端通用）

/** 小说章节阅读页 /novel/<书>/<卷>/<章>：沉浸阅读，不显示悬浮播放器、猫、工具箱等全站浮层 */
export function isReaderPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname && /^\/novel\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname));
}
