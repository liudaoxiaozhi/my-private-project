#!/usr/bin/env bash
# scripts/self-host/common.sh —— update.sh / backup.sh 共用的准备工作和小工具（不要直接运行）
#
# - 宝塔的「计划任务」「WebHook」里环境变量很少：补上 HOME 和 node / npm / pm2 所在的目录
# - 同一时间只跑一个 update.sh / backup.sh（flock），免得两个 git 命令撞在一起
# - git 命令都在仓库根目录执行；博客在仓库里的子目录（XHBlogs/）由 BLOG_PREFIX 表示
set -euo pipefail

BLOG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export HOME="${HOME:-/root}"
export LANG="${LANG:-C.UTF-8}"

log() { echo "[$(date '+%F %T')] $*"; }

if ! command -v node >/dev/null 2>&1; then
  # 宝塔「Node.js 版本管理器」装在 /www/server/nodejs/版本号/bin；有多个版本时用最新的
  for dir in $(ls -d /www/server/nodejs/v*/bin 2>/dev/null | sort -V -r) /usr/local/bin /usr/bin; do
    if [ -x "$dir/node" ]; then
      export PATH="$dir:$PATH"
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  log "找不到 node：先在宝塔「软件商店 → Node.js 版本管理器」里安装 Node 22（见 docs/DEPLOY-BAOTA.md）"
  exit 1
fi
# npm、pm2 一般和 node 在同一个目录
export PATH="$(dirname "$(command -v node)"):$PATH"

if command -v flock >/dev/null 2>&1; then
  exec 9>"${TMPDIR:-/tmp}/xhblogs-self-host.lock"
  if ! flock -w 600 9; then
    log "另一个 update.sh / backup.sh 还在运行，这次先跳过"
    exit 1
  fi
fi

REPO_DIR="$(git -C "$BLOG_DIR" rev-parse --show-toplevel)"
BLOG_PREFIX="$(git -C "$BLOG_DIR" rev-parse --show-prefix)"
cd "$REPO_DIR"

# 服务器上没设过 git 的名字和邮箱时，用一个默认的（只对这些脚本生效，不改 git 配置）
if [ -z "$(git config user.email || true)" ]; then
  export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-XHBlogs 服务器}" GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-XHBlogs 服务器}"
  export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-xhblogs-server@localhost}" GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-xhblogs-server@localhost}"
fi

# 后台能改的内容（和 lib/server/admin/storage.ts 的白名单一致）
CONTENT_PATHS=(posts chatters moments data public/music public/anime/covers public/images/uploads siteConfig.overrides.json app/about/about.md)

# 构建时会自动改写、又被 git 跟踪的文件：拉代码前先还原，免得挡住 git pull（下次构建会重新生成）
restore_generated() {
  local file
  for file in "${BLOG_PREFIX}lib/generated/image-meta.json" "${BLOG_PREFIX}tsconfig.json"; do
    if ! git diff --quiet -- "$file" 2>/dev/null; then
      git checkout -- "$file"
    fi
  done
}

# 把后台改过的内容提交到本地仓库：只提交上面这些位置，绝不提交 .env* 和代码。没有变化时什么也不做
commit_content() {
  local message="$1" paths=() p
  for p in "${CONTENT_PATHS[@]}"; do
    if [ -e "$BLOG_DIR/$p" ] || [ -n "$(git ls-files -- "$BLOG_PREFIX$p" | head -n 1)" ]; then
      paths+=("$BLOG_PREFIX$p")
    fi
  done
  if [ ${#paths[@]} -eq 0 ]; then
    return 0
  fi
  git add -A -- "${paths[@]}"
  # 保险：万一有 .env 文件混进来，取消暂存
  git diff --cached --name-only -z | grep -zE '(^|/)\.env' | xargs -0 -r git reset -q -- || true
  if git diff --cached --quiet; then
    log "内容没有变化"
    return 0
  fi
  git commit -q -m "$message"
  log "已提交：$message"
}

# git pull：只合并（不 rebase、不 reset、不强制）。有冲突时放弃这次合并，文件保持原样
pull_merge() {
  if ! git pull --no-rebase --no-edit; then
    git merge --abort 2>/dev/null || true
    log "git pull 失败（网络问题，或者和 GitHub 上的修改冲突了），已放弃这次合并，网站和文件保持原样。"
    log "请登录服务器处理：cd $REPO_DIR && git status"
    return 1
  fi
}

# 拉到了新提交：重建网站（package.json / package-lock.json 变了先 npm ci）。在后台进行，马上返回
rebuild_after_pull() {
  local old="$1" new
  new="$(git rev-parse HEAD)"
  if [ "$old" = "$new" ]; then
    log "GitHub 上没有新的提交"
    return 0
  fi
  # 说明取拉下来的最新一个非合并提交，比如「代码更新（599923f 改代码）」
  local args=(--reason "代码更新（$(git log -1 --no-merges --format='%h %s' "$old..$new" | cut -c1-70)）")
  if ! git diff --quiet "$old" "$new" -- "${BLOG_PREFIX}package.json" "${BLOG_PREFIX}package-lock.json"; then
    args+=(--install)
    log "依赖有变化，重建前会先 npm ci"
  fi
  node "$BLOG_DIR/scripts/self-host/rebuild.mjs" "${args[@]}"
}
