# syntax=docker/dockerfile:1
# XHBlogs 前台 Docker 镜像（Next.js standalone 模式）
#
# 构建：docker build -t xhblogs .
# 运行：docker run -d -p 3000:3000 --env-file .env.local xhblogs
# 或者：docker compose up -d --build
#
# public/music/ 里的歌曲会在构建时一起打包进镜像，并自动生成歌单。
# 换歌后需要重新构建镜像（docker compose up -d --build）。

ARG NODE_VERSION=22-alpine

# ---------- 1. 安装依赖 ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# 国内服务器构建时可改为 --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json ./
# 优先用锁文件精确安装；锁文件和 package.json 不一致时（例如新增依赖后还没更新锁文件）退回 npm install
RUN npm config set registry "$NPM_REGISTRY" && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund)

# ---------- 2. 构建 ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 内容目录可能被删空，确保存在，避免后面的 COPY 失败
RUN mkdir -p posts chatters moments novel public/music
# 开启 standalone 输出（见 next.config.ts），Vercel 部署不受影响
ENV BUILD_STANDALONE=true \
    NEXT_TELEMETRY_DISABLED=1
# 可选：构建时指定站点地址，用于 sitemap 与分享卡片
ARG SITE_URL=""
ENV SITE_URL=${SITE_URL}
# npm run build 会先扫描 public/music 生成歌单，再执行 next build
RUN npm run build

# ---------- 3. 运行 ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# standalone 服务端与静态资源（standalone 不会自动带上 public 和 .next/static）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 页面渲染时会按 process.cwd() 读取的内容文件，一并放进运行镜像
COPY --from=builder --chown=nextjs:nodejs /app/posts ./posts
COPY --from=builder --chown=nextjs:nodejs /app/chatters ./chatters
COPY --from=builder --chown=nextjs:nodejs /app/moments ./moments
COPY --from=builder --chown=nextjs:nodejs /app/novel ./novel
COPY --from=builder --chown=nextjs:nodejs /app/app/about/about.md ./app/about/about.md

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
