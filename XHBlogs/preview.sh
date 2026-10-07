#!/usr/bin/env bash
# XHBlogs 本地预览（macOS / Linux）
# 用法：./preview.sh          开发模式（改动即时生效）
#       ./preview.sh --prod   正式模式（与线上速度一致）
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "[错误] 未检测到 Node.js，请安装 20.9+：https://nodejs.org/"; exit 1; }
major=$(node -p "process.versions.node.split('.')[0]")
[ "$major" -ge 20 ] || { echo "[错误] Next.js 16 需要 Node.js 20.9+，当前 $(node -v)"; exit 1; }

[ -f .env.local ] || { [ -f .env.example ] && cp .env.example .env.local && echo "[提示] 已生成 .env.local，按需填写密钥（留空也能预览）。"; }
# 首次运行，或 package.json 新增了依赖时安装
npm ls --depth=0 >/dev/null 2>&1 || { echo "[1/2] 安装依赖..."; npm install; }

if [ "${1:-}" = "--prod" ]; then
  # 正式模式：与线上一致，适合检查性能；改动后需重新运行
  echo "[2/2] 构建并以正式模式启动：http://localhost:3000"
  npm run build && npm run start
else
  echo "[2/2] 启动开发服务器：http://localhost:3000（检查性能请用 ./preview.sh --prod）"
  npm run dev
fi
