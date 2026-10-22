#!/usr/bin/env bash
# scripts/self-host/backup.sh —— 把后台在服务器上改过的内容备份到 GitHub（宝塔「计划任务」每天执行一次，步骤见 docs/DEPLOY-BAOTA.md）
#
#   bash /www/wwwroot/xhblogs/XHBlogs/scripts/self-host/backup.sh
#
# 1. 只提交内容：posts、chatters、moments、data、public/music、public/anime/covers、public/images/uploads、
#    siteConfig.overrides.json、app/about/about.md。绝不提交 .env*（密码、密钥）和代码。提交说明「服务器备份：日期」
# 2. git pull --no-rebase --no-edit（合并 GitHub 上的新提交，有冲突就放弃、原样退出），然后 git push
#    推送需要部署密钥有写权限（GitHub 仓库 → Settings → Deploy keys → 勾选 Allow write access）
# 3. 拉到了别人的新提交（比如在电脑上改了代码）时，顺便重建网站
#
# 注意：推到 main 以后 Vercel 也会跟着重新部署一次——过渡期两边内容保持一致，正好。
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

restore_generated
commit_content "服务器备份：$(date '+%F %T')"
OLD="$(git rev-parse HEAD)"
pull_merge || exit 1
if ! git push --quiet; then
  log "git push 失败：检查 GitHub 上的部署密钥是否勾选了「Allow write access」，以及 git remote 是不是 git@github.com:… 的地址"
  exit 1
fi
log "已推送到 GitHub"
rebuild_after_pull "$OLD"
