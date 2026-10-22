# 部署到自己的服务器（宝塔面板）

这篇一步一步教你把博客放到自己的海外 Linux 云服务器上，用宝塔面板管理。部署好以后：

- 网页后台（`/admin`）点「保存」时，**直接写进服务器上的文件**，不经过 GitHub，也不需要 GitHub 令牌
- 保存后网站**自动重新构建**，大约 **1～3 分钟后上线**；后台顶部和「概览」里能看到 排队中 / 重建中 / 已上线 / 失败。
  构建失败时线上还是之前的版本，不会挂
- 每天自动把后台改过的内容**备份到 GitHub**；在电脑上改了代码推到 GitHub，服务器也能自动拉下来更新

Vercel 那边暂时不用动，两边可以同时存在，等服务器跑稳了再把域名切过来（见第 13 步）。

下面所有命令都在宝塔左侧菜单的「**终端**」里执行（默认是 root 用户）。路径都按
`/www/wwwroot/xhblogs`（仓库）和 `/www/wwwroot/xhblogs/XHBlogs`（博客项目目录）来写，换了位置的话命令里跟着改。

---

## 0. 需要准备什么

| 东西 | 要求 |
| --- | --- |
| 服务器 | 海外 Linux（推荐 Ubuntu 22.04 / 24.04 或 Debian 12），**内存至少 2 GB**；只有 1～2 GB 的话一定要加 2 GB 交换空间（第 1 步） |
| 硬盘 | 20 GB 以上（歌曲多的话再大点） |
| 宝塔面板 | 已经装好（Linux 面板 9.x / 8.x 都行），装了 Nginx |
| 域名 | 能改 DNS 解析 |
| GitHub | 能打开博客仓库的 Settings（要加部署密钥） |

> 为什么要这么多内存：网站不是边访问边生成的，而是先「构建」出所有页面。构建 Next.js 要用 1～1.5 GB 内存，
> 而网站本身同时还在运行。内存不够时构建会被系统杀掉（网站不受影响，只是新内容上不去）。

## 1. 加交换空间（内存 ≤ 2 GB 时）

先看看现在有多少：

```bash
free -h
```

`Swap` 那一行是 0 的话，加 2 GB：

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h   # Swap 这一行变成 2.0Gi 就好了
```

（宝塔「软件商店」里的「Linux 工具箱」也能设置 Swap，效果一样。）

## 2. 安装 Node.js、PM2、Git

1. 宝塔「**软件商店**」→ 搜索「**Node.js 版本管理器**」→ 安装
2. 打开它的「设置」→ 安装 **v22** 开头的最新版本（至少要 20.9）→ 装好后把它设为「**命令行版本**」
3. 在终端里安装 PM2（让网站在后台一直运行、开机自启）：

   ```bash
   npm i -g pm2
   ```

   宝塔「软件商店」里的「PM2 管理器」也可以，装哪个都行。
4. 检查一下：

   ```bash
   node -v    # v22.x.x
   npm -v
   pm2 -v
   git --version   # 没有的话：Ubuntu / Debian 用 apt install -y git，CentOS 用 yum install -y git
   ```

## 3. 用部署密钥下载仓库

仓库是私有的，服务器要有一把「钥匙」才能下载；之后每天备份也要用它推送，所以要给**写权限**。

1. 在服务器上生成一把钥匙：

   ```bash
   ssh-keygen -t ed25519 -C "xhblogs-server" -f /root/.ssh/xhblogs_deploy -N ""
   cat /root/.ssh/xhblogs_deploy.pub
   ```

   把最后一条命令打印出来的那一行（`ssh-ed25519 AAAA... xhblogs-server`）复制下来。
2. 打开 GitHub 上的博客仓库 → **Settings** → **Deploy keys** → **Add deploy key**：
   - Title：`xhblogs-server`
   - Key：粘贴刚才那一行
   - **勾选 Allow write access**（备份脚本要推送）
   - 点 Add key
3. 告诉服务器访问 GitHub 时用这把钥匙：

   ```bash
   cat >> /root/.ssh/config <<'EOF'
   Host github.com
     HostName github.com
     User git
     IdentityFile /root/.ssh/xhblogs_deploy
     IdentitiesOnly yes
   EOF
   chmod 600 /root/.ssh/config
   ssh -T git@github.com   # 第一次会问 yes/no，输入 yes；看到 "successfully authenticated" 就对了
   ```

4. 下载仓库（注意用 `git@github.com:` 开头的地址，不要用 https 的）：

   ```bash
   mkdir -p /www/wwwroot && cd /www/wwwroot
   git clone git@github.com:liudaoxiaozhi/my-private-project.git xhblogs
   cd /www/wwwroot/xhblogs
   git config user.name "XHBlogs 服务器"
   git config user.email "你的邮箱"
   ```

## 4. 填配置

```bash
cd /www/wwwroot/xhblogs/XHBlogs
cp deploy/env.example .env.production.local
```

然后在宝塔「**文件**」里打开 `/www/wwwroot/xhblogs/XHBlogs/.env.production.local` 编辑（以点开头的文件默认隐藏，
文件列表上方的设置里打开「显示隐藏文件」）。每一项文件里都有说明，最重要的几项：

| 名称 | 填什么 |
| --- | --- |
| `ADMIN_PASSWORD` | 后台密码，长一点 |
| `ADMIN_SECRETS_KEY` | **强烈建议设**。后台保存的密钥（TMDB / Bangumi / Gemini）和账单都是用它加密的。**必须和 Vercel 上的一样**，否则从 GitHub 带过来的 `data/secrets.json`、`data/bills.json` 解不开。Vercel 上还没设的话，两边同时设上同一个值；之前用管理员密码加密的内容照样能读（所以 `ADMIN_PASSWORD` 也要和 Vercel 上的一样），下次保存时换成新钥匙 |
| `ADMIN_STORAGE` | `local`（不要改） |
| `ADMIN_LOCAL_ROOT` | 项目目录 `/www/wwwroot/xhblogs/XHBlogs`；放在别的位置就改成对应的路径 |
| `SELF_HOST_REBUILD` | `1`：保存后自动重建 |
| `REBUILD_RESTART_CMD` | 构建好之后怎么重启网站，默认 `pm2 reload xhblogs --update-env`，照着这篇做的不用改 |
| `TRUST_PROXY` | `1`：网站在宝塔的 nginx 后面，相信 nginx 传来的访客 IP 和域名（登录限流、后台的同源检查要用）。前面还套了 CDN（比如 Cloudflare）就填 `2` |
| `SITE_URL` | 网站正式地址，比如 `https://your-domain.com`（sitemap 和分享卡片用） |

其余的（`GEMINI_API_KEY`、`TMDB_API_KEY`、`BANGUMI_ACCESS_TOKEN`、`NETEASE_API_BASE`……）和 Vercel 上一样，
有就填，没有就空着（不少也能在后台「书影音与密钥」里填）。**不用填** `GITHUB_TOKEN`、`GITHUB_REPO`。

> `.env.production.local` 不会被提交到 GitHub（已被 `.gitignore` 忽略，备份脚本也绝不提交 `.env` 开头的文件）。
> 以后改了这个文件，到后台「概览」点「**立即重建**」就生效。

## 5. 安装依赖、第一次构建

```bash
cd /www/wwwroot/xhblogs/XHBlogs
npm ci
npm run build
```

要几分钟。最后看到一张路由表、没有红色的 `Error` 就成功了。
如果中途出现 `Killed` 或 `JavaScript heap out of memory`，是内存不够：回第 1 步加交换空间再来。

## 6. 用 PM2 启动网站

```bash
cd /www/wwwroot/xhblogs/XHBlogs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # 设置开机自启；如果它打印出一条命令让你执行，就复制执行一下
curl -I http://127.0.0.1:3000   # 看到 HTTP/1.1 200 OK 就说明网站跑起来了
```

`ecosystem.config.cjs` 里已经设好了：进程名 `xhblogs`、端口 3000、**只监听本机**（外面只能经过 nginx 访问）、
内存超过 1 GB 自动重启、日志写在项目的 `logs/` 文件夹。

> 不要再在宝塔「网站 → Node 项目」里把它加一遍，两边会抢同一个端口。

## 7. 添加网站、反向代理

1. 宝塔「**网站**」→「**添加站点**」：
   - 域名：先填一个**临时子域名**，比如 `srv.your-domain.com`（正式域名现在还指向 Vercel，第 13 步再换过来）。
     到域名的 DNS 解析里给 `srv` 加一条 **A 记录**，指向服务器的 IP
   - 根目录：默认就行（不会用到）
   - PHP 版本：**纯静态**；数据库：不创建
2. 在网站列表里点这个站点的「**设置**」→「**反向代理**」→「**添加反向代理**」：
   - 代理名称：`xhblogs`
   - 目标 URL：`http://127.0.0.1:3000`
   - 发送域名：`$host`（默认就是，**不要**改成 127.0.0.1）
   - 不要开「缓存」
   - 提交

   （宝塔 9 也可以在「网站 → 反向代理 → 添加反代」里直接建，填法一样。）

## 8. 申请 HTTPS 证书

站点「设置」→「**SSL**」→「**Let's Encrypt**」→ 勾选域名 → 申请。成功后打开右上角的「**强制 HTTPS**」。

> 一定要先配好 HTTPS 再登录后台：登录状态的 Cookie 只在 HTTPS 下保存，用 http:// 打开的话，登录后会马上又回到登录页。

## 9. 调整 nginx：上传大小、代理头

1. 站点「设置」→「**配置文件**」，在 `server {` 下面一行加上（歌曲文件比较大，宝塔默认一般只允许 50 MB）：

   ```nginx
   client_max_body_size 100m;
   ```

2. 站点「设置」→「反向代理」→ 刚才那条的「**配置文件**」，确认里面有这几行（宝塔默认已经有前三行，后两行加上）：

   ```nginx
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Host $host;
   proxy_set_header X-Forwarded-Proto $scheme;
   ```

   这几个请求头告诉网站访客的真实 IP 和访问的域名，配合 `.env.production.local` 里的 `TRUST_PROXY=1` 使用。
   没开 `TRUST_PROXY` 时网站不相信这些请求头（谁都能伪造），开了才信——所以网站只监听 127.0.0.1，外面绕不过 nginx。

3. 保存。打开 `https://srv.your-domain.com`，网站出来了；再打开 `https://srv.your-domain.com/admin` 登录试试。

## 10. 防火墙

宝塔「**安全**」里只放行这些端口：**22**（SSH）、**80**、**443**，以及宝塔面板自己的端口。
**3000 不要放行**（网站只监听本机，放行了也连不上，但别留口子）。云服务商控制台里的「安全组」同样只开这几个。

## 11. 日常使用：保存、重建、看日志

- 在后台保存后，顶部会出现进度条：「已保存，网站马上开始重建…」→「网站正在重建，大约 1~3 分钟后上线…」→「网站已经更新好了」。
  10 秒内连续保存好几处只会构建一次；构建期间又保存了，做完这次会自动再构建一次
- 「**概览 → 网站重建**」显示最近一次的状态（排队中 / 重建中 / 已上线 / 失败）和时间；失败时可以展开「查看日志」。
  构建失败时线上还是之前的版本
- 「**立即重建**」：手动重建一次，比如改了 `.env.production.local` 之后
- 在终端里看：

  ```bash
  cd /www/wwwroot/xhblogs/XHBlogs
  tail -n 100 .rebuild.log          # 构建日志（每次构建的完整输出）
  cat .rebuild-status.json          # 当前状态
  pm2 logs xhblogs --lines 100      # 网站本身的日志（也在 logs/ 文件夹里）
  node scripts/self-host/rebuild.mjs --foreground   # 在终端里手动重建一次，直接看到输出
  ```

重建做的事：构建到 `.next-staging`（线上的 `.next` 不动）→ 成功后把 `.next` 换成新的 → `pm2 reload xhblogs` 平滑重启
（先启动新进程，再停掉旧的，访客不会看到报错）。同一时间只会有一个构建在跑。

## 12. 每天备份到 GitHub（计划任务）

服务器上后台改的内容只在服务器的硬盘上，要定期推到 GitHub 备份一份：

宝塔「**计划任务**」→「添加任务」：

- 任务类型：**Shell 脚本**
- 任务名称：`博客备份`
- 执行周期：每天，凌晨 4 点 30 分（避开访问高峰就行）
- 脚本内容：

  ```bash
  bash /www/wwwroot/xhblogs/XHBlogs/scripts/self-host/backup.sh
  ```

保存后点一次「**执行**」，再点「日志」看看：出现「已推送到 GitHub」或者「内容没有变化」就对了。

它只提交内容：`posts/`、`chatters/`、`moments/`、`data/`、`public/music/`、`public/anime/covers/`、`public/images/uploads/`、
`siteConfig.overrides.json`、`app/about/about.md`，提交说明是「服务器备份：日期时间」，**绝不提交 `.env` 开头的文件和代码**。
提交后先 `git pull` 合并 GitHub 上的新提交（只合并，有冲突就放弃、原样退出并在日志里说明），再推送。

> 推到 `main` 以后 Vercel 也会跟着重新部署一次。过渡期正好让 Vercel 上的网站内容和服务器保持一致。

> GitHub 不收超过 100 MB 的单个文件，歌曲太大的话备份会推送失败（日志里能看到）。单首歌尽量控制在 20 MB 以内。

## 13. 代码更新（可选）

在电脑上改了代码、推到 GitHub 后，让服务器自动拉下来并重建。两种方式选一个：

**方式一（推荐）：计划任务定时检查。** 宝塔「计划任务」→ 添加：Shell 脚本，名称 `博客更新`，执行周期「N 分钟」填 10，脚本内容：

```bash
bash /www/wwwroot/xhblogs/XHBlogs/scripts/self-host/update.sh
```

没有新提交时什么也不做；有新提交才重建。

**方式二：WebHook，推送后马上更新。** 宝塔「软件商店」装「**WebHook**」插件 → 添加，脚本内容同上 → 复制它的地址 →
GitHub 仓库 **Settings → Webhooks → Add webhook**，Payload URL 填这个地址，只选 push 事件。
注意这个地址走的是宝塔面板的端口，要让 GitHub 访问得到，等于把面板端口开放到公网，所以更推荐方式一。

`update.sh` 做的事：

1. 先把后台在服务器上改过、还没备份的内容提交到本地（不推送），免得挡住 `git pull`
2. `git pull --no-rebase --no-edit`：只合并，**绝不 reset / 强制覆盖**；有冲突就放弃合并、原样退出
3. 有新提交时开始重建；`package.json` / `package-lock.json` 变了会先 `npm ci`。构建在后台进行，脚本马上返回

想不管有没有新提交都重建一次：`bash .../update.sh --force`。

## 14. 把域名从 Vercel 换到服务器

**不要急着关 Vercel**，按这个顺序来：

1. **先用临时子域名跑几天**（前面第 7～12 步就是这样做的）：登录后台、写篇文章、上传图片和歌曲、看重建是否正常、备份是否推送成功
2. **过渡期只在服务器的后台改内容**（`https://srv.your-domain.com/admin`），不要再用 Vercel 上的后台——两边各改各的，内容会分叉、备份时冲突。
   服务器每天备份推到 GitHub 后，Vercel 会自动重新部署，所以正式域名（还在 Vercel 上）看到的内容也是新的，只是晚一点
3. **切换域名**：
   1. 宝塔站点「设置」→「域名管理」→ 加上正式域名（`your-domain.com`、`www.your-domain.com`）
   2. 到 DNS 解析里，把正式域名原来指向 Vercel 的记录（CNAME `cname.vercel-dns.com` 或 A `76.76.21.21`）**改成 A 记录，指向服务器 IP**
   3. 等几分钟到几小时生效（`ping your-domain.com` 显示服务器 IP 就生效了）
   4. 站点「SSL」→ Let's Encrypt → 勾上所有域名重新申请证书 → 打开「强制 HTTPS」
   5. 确认 `.env.production.local` 里的 `SITE_URL` 是正式域名，改过的话到后台点「立即重建」
4. **观察几天没问题后，断开 Vercel**：Vercel 项目 → Settings → **Domains** 删掉正式域名；
   不再需要 Vercel 时 Settings → **Git** → Disconnect（之后备份推送就不会再触发 Vercel 部署），或者直接删除项目

## 15. 常见问题

**构建失败 / 构建时进程被杀掉（`Killed`、`heap out of memory`）**
内存不够。按第 1 步加交换空间，`free -h` 确认后在后台点「立即重建」。线上在这期间一直是旧版本。

**打开网站显示 502 Bad Gateway**
网站进程没在运行。终端里：

```bash
pm2 status                      # xhblogs 应该是 online
pm2 logs xhblogs --lines 100    # 看报错
pm2 restart xhblogs
```

还有确认反向代理的目标是 `http://127.0.0.1:3000`。

**后台登录后马上又回到登录页**
没用 HTTPS 打开。先做第 8 步，用 `https://` 打开后台。

**后台保存时提示「请求来源不对」**
nginx 传给网站的域名不对：检查反向代理的「发送域名」是 `$host`，并按第 9 步加上 `X-Forwarded-Host`，`.env.production.local` 里设 `TRUST_PROXY=1`，
然后 `pm2 reload xhblogs`。

**所有人登录都提示「密码错太多次了」**
网站把所有访客当成了同一个 IP：确认第 9 步的 `X-Real-IP` 那几行在、`TRUST_PROXY=1`。

**上传歌曲提示文件太大**
第 9 步的 `client_max_body_size 100m;` 没加或者没保存。

**重建一直「排队中」，或者失败说「重启网站失败」**
看 `tail -n 100 .rebuild.log`。「重启网站失败」一般是 PM2 里的进程名不是 `xhblogs`（`pm2 status` 看看），
或者不是用 `ecosystem.config.cjs` 启动的；改 `.env.production.local` 里的 `REBUILD_RESTART_CMD` 为实际的重启命令即可。
这时新版本已经换上了，手动执行一次 `pm2 reload xhblogs` 就上线了。

**改了 `.env.production.local` 没生效**
后台「概览」点「立即重建」（会重新构建并重启网站，新配置两处都生效）。

**备份或更新的日志里说 git pull 冲突**
同一个文件在服务器上和 GitHub 上都被改了（比如过渡期在两边后台都改了同一篇文章）。脚本已经放弃了这次合并，文件和网站都保持原样。
手动处理：

```bash
cd /www/wwwroot/xhblogs
git pull --no-rebase        # 会列出冲突的文件
# 用宝塔「文件」打开冲突的文件，保留想要的内容，删掉 <<<<<<< ======= >>>>>>> 这些标记
git add -A && git commit -m "合并冲突"
git push
bash XHBlogs/scripts/self-host/update.sh --force
```

**硬盘占用**
构建时会临时多一份 `.next-staging`（几百 MB），换上之后旧的自动删掉。

---

## 附：相关文件和环境变量

| 文件 | 作用 |
| --- | --- |
| `ecosystem.config.cjs` | PM2 配置：进程名 `xhblogs`、端口（环境变量 `PORT`，默认 3000）、只监听本机、日志在 `logs/` |
| `deploy/env.example` | 服务器配置模板，复制成 `.env.production.local` |
| `scripts/self-host/rebuild.mjs` | 重建：构建到 `.next-staging` → 换上 → 重启；后台保存后自动调用 |
| `scripts/self-host/update.sh` | 拉代码更新并重建 |
| `scripts/self-host/backup.sh` | 把内容备份到 GitHub |
| `.rebuild-status.json`、`.rebuild.log`、`.rebuild.lock`、`.rebuild.pending` | 重建的状态、日志、锁、「做完再来一次」的记号（都不会提交） |

| 环境变量 | 说明 |
| --- | --- |
| `ADMIN_STORAGE=local` | 后台直接读写服务器上的文件 |
| `ADMIN_LOCAL_ROOT` | 项目目录；不填就是网站运行的目录 |
| `SELF_HOST_REBUILD=1` | 保存后自动重建（只在 `ADMIN_STORAGE=local`、`next start` 时生效） |
| `REBUILD_DEBOUNCE_MS` | 最后一次保存后等多久开始构建，默认 10000（10 秒） |
| `REBUILD_RESTART_CMD` | 构建好之后的重启命令，默认 `pm2 reload xhblogs --update-env` |
| `REBUILD_COMMAND` | 设了就用它代替「构建 + 换目录 + 重启」（测试用，平时不要设） |
| `REBUILD_STATUS_FILE` | 状态文件的位置（锁、日志放在它旁边），默认项目目录下的 `.rebuild-status.json` |
| `TRUST_PROXY` | `1`：相信反向代理传来的 `X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Host`；前面还有 CDN 时填代理的层数（比如 `2`）。不设时不信客户端能伪造的部分：域名只看 `Host`，IP 只取 `X-Forwarded-For` 的最后一个值（离网站最近的那一跳）。Vercel 上不用设 |
