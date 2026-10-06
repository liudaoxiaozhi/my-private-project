#!/usr/bin/env bash
# XHBlogs 本地预览（macOS / Linux）
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "[错误] 未检测到 Node.js，请安装 20.9+：https://nodejs.org/"; exit 1; }
major=$(node -p "process.versions.node.split('.')[0]")
[ "$major" -ge 20 ] || { echo "[错误] Next.js 16 需要 Node.js 20.9+，当前 $(node -v)"; exit 1; }

[ -f .env.local ] || { [ -f .env.example ] && cp .env.example .env.local && echo "[提示] 已生成 .env.local，按需填写密钥（留空也能预览）。"; }
[ -d node_modules ] || { echo "[1/2] 首次运行，安装依赖..."; npm install; }

echo "[2/2] 启动开发服务器：http://localhost:3000"
npm run dev
