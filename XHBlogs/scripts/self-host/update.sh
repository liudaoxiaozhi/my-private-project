#!/usr/bin/env bash
# scripts/self-host/update.sh —— 拉取 GitHub 上的新代码并重建网站（步骤见 docs/DEPLOY-BAOTA.md）
#
# 在宝塔「计划任务」（比如每 10 分钟）或 WebHook 插件里执行：
#   bash /www/wwwroot/xhblogs/XHBlogs/scripts/self-host/update.sh           有新提交才重建
#   bash /www/wwwroot/xhblogs/XHBlogs/scripts/self-host/update.sh --force   没有新提交也重建一次
#
# 1. 先把后台在服务器上改过、还没备份的内容提交到本地仓库（不推送；推送是 backup.sh 的事），免得挡住 git pull
# 2. git pull --no-rebase --no-edit：只合并，绝不 reset / 强制覆盖；有冲突就放弃合并、原样退出
# 3. 有新提交时启动 scripts/self-host/rebuild.mjs（依赖变了先 npm ci）。构建在后台进行，这个脚本马上返回，
#    进度看后台「概览 → 网站重建」或项目目录下的 .rebuild.log；构建失败时线上还是旧版本
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

restore_generated
commit_content "服务器备份：$(date '+%F %T')"
OLD="$(git rev-parse HEAD)"
log "拉取 GitHub 上的更新…"
pull_merge || exit 1
if [ "$FORCE" = 1 ] && [ "$OLD" = "$(git rev-parse HEAD)" ]; then
  node "$BLOG_DIR/scripts/self-host/rebuild.mjs" --reason "手动更新"
else
  rebuild_after_pull "$OLD"
fi
