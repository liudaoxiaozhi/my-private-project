import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 🚨 核心修改 1：关掉纯静态导出，让 Vercel 帮你把 API 跑起来！
  // output: 'export',

  // Docker 部署时由 Dockerfile 设置 BUILD_STANDALONE=true，输出可独立运行的 server.js；
  // Vercel 部署不设置这个变量，行为不变。
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,

  // 端到端测试（npm run test:e2e）构建到单独的 .next-e2e 目录，测试用的示例文章不会混进正式构建
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // 🚨 核心修改 2：Vercel 不需要强制加斜杠，关掉它能避免很多 API 路径匹配错误
  // trailingSlash: true,

  images: {
    // 开启 Next.js 图片优化（自动转 WebP/AVIF、按设备宽度输出尺寸）。
    // 如需关闭（例如改回静态导出，或 Vercel 图片优化额度用尽），设置环境变量 IMAGE_UNOPTIMIZED=true。
    unoptimized: process.env.IMAGE_UNOPTIMIZED === 'true',
    formats: ['image/avif', 'image/webp'],
    // ⚠️ 与 lib/images.ts 的 OPTIMIZED_IMAGE_HOSTS 保持一致；不在名单里的外链由 AppImage 自动直出
    remotePatterns: [
      { protocol: 'https', hostname: 'bu.dusays.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
    ],
  },
  typescript: {
    ignoreBuildErrors: true, // 忽略 TS 错误，方便快速部署
  },

  async redirects() {
    return [
      // 「追番」改名「书影音」：旧链接永久跳到新页面。只匹配 /anime 本身，封面图 /anime/covers/... 不受影响
      { source: '/anime', destination: '/media', permanent: true },
    ];
  },
};

export default nextConfig;
