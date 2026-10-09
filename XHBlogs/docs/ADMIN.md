# 网页后台（/admin）

打开 `你的网址/admin`，登录后就能在浏览器里（手机也行）管理整个博客：

| 板块 | 能做什么 |
| --- | --- |
| 概览 | 文章、杂谈、说说、歌曲、照片、友链、项目的数量；最近的修改；网站部署状态 |
| 文章 / 杂谈 | 写、改、删；Markdown 编辑器带工具栏、插图（可直接粘贴截图）、和网站一模一样的预览 |
| 说说 | 发说说，可以带多张配图 |
| 歌曲 | 上传 mp3（可带封面、LRC 歌词）、调整顺序、置顶（第一首是默认播放的）、改名、删除 |
| 弹幕 | 首页开场飘过的弹幕：增删改、开关 |
| 外观 | 背景插画（电脑 / 手机）、模糊、漫画风背景、实验室风格、黑胶播放器、首页开场文字、默认封面、各种特效开关 |
| 照片墙 / 友链 / 项目 | 增删改、排序、上传图片 |
| 关于我 | 「关于」页正文 |
| 站点设置 | 名字、头像、简介、导航栏站名、社交链接、时区、天气、生日、备案号…… |

右上角「简洁」去掉背景插画和毛玻璃，手机上更省电。

## 它是怎么保存的

后台不用数据库。点「保存」时，它把这次改动的所有文件（文章、上传的图片……）做成**一个提交**推到 GitHub 仓库，
Vercel 收到提交后自动重新部署，**大约 1～2 分钟后网站更新**。后台页面顶部会显示部署进度，好了会提示「网站已经更新好了」。

- 文章、杂谈、说说还是 `posts/`、`chatters/`、`moments/` 里的 Markdown 文件，和以前一样
- 照片墙、友链、项目在 `data/*.json`
- 站点设置：`siteConfig.ts` 里是带说明的默认值，后台改过的项保存在 `siteConfig.overrides.json`（只存和默认值不一样的部分）。
  想恢复默认，在后台点那一项旁边的「恢复默认」
- 上传的图片在 `public/images/uploads/年/月/`，会先在浏览器里压成 WebP（长边不超过 2400 像素）
- 歌曲在 `public/music/`，顺序就是文件名前的序号，调整顺序就是重新编号改名

因为一切都在仓库里，所以随时可以在 GitHub 上看到每一次修改、需要时回退。

> 以前电脑上的 `my-blog-manager`（本地管理器）不要再和网页后台混着用：它同步时会把整个 `posts/`、`siteConfig.ts` 等覆盖掉，
> 网页上做的修改就丢了。

## 开启步骤（只需要做一次）

### 1. 生成 GitHub 令牌

1. 打开 GitHub → 右上角头像 → **Settings** → 最下面 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. 填写：
   - **Token name**：随便，比如 `blog-admin`
   - **Expiration**：选长一点（最长一年；过期后后台会提示「GITHUB_TOKEN 无效或已过期」，再生成一个换上即可）
   - **Repository access**：选 **Only select repositories**，只勾博客这个仓库
   - **Permissions → Repository permissions**：
     - **Contents**：**Read and write**（读写文件、提交）
     - **Commit statuses**：**Read-only**（读取 Vercel 的部署状态，不给也能用，只是看不到部署进度）
3. 点 **Generate token**，复制那串 `github_pat_...`（只显示一次）

### 2. 在 Vercel 里添加环境变量

Vercel → 你的项目 → **Settings** → **Environment Variables**，添加：

| 名称 | 值 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 自己定一个**长一点**的密码 | 登录后台用。没设这个，后台整个不可用 |
| `GITHUB_TOKEN` | 上一步复制的 `github_pat_...` | |
| `GITHUB_REPO` | `用户名/仓库名`，比如 `liudaoxiaozhi/my-private-project` | |
| `GITHUB_BRANCH` | `main` | Vercel 部署的那个分支；不填默认 `main` |
| `GITHUB_BLOG_DIR` | `XHBlogs` | 博客在仓库里的文件夹；不填默认 `XHBlogs`。博客就在仓库根目录时填 `.` |

加完以后到 **Deployments** 里点最新一次部署右边的 **⋯ → Redeploy**，让新变量生效。然后打开 `你的网址/admin` 登录即可。

### 安全说明

- 登录状态保存 7 天；改了 `ADMIN_PASSWORD` 后，所有已登录的设备都会被登出
- 同一个 IP 十分钟内输错 8 次密码会被暂时锁住
- 后台只能改上面列出的那些位置（文章、数据、设置、上传目录、音乐目录），改不了代码
- 超过 3MB 的音频是浏览器直接传到 GitHub 的（Vercel 的接口收不了 4.5MB 以上的请求），
  这时会把 `GITHUB_TOKEN` 临时交给已登录的浏览器用一次。所以令牌一定只给这一个仓库的权限，管理员密码也别太简单

## 本地预览

本地 `npm run dev` 时，后台默认直接读写电脑上的文件（不经过 GitHub）。在 `.env.local` 里设好 `ADMIN_PASSWORD` 就能登录 `http://localhost:3000/admin`。
想在本地也走 GitHub，就把上面那几个 `GITHUB_*` 也写进 `.env.local`。

## 测试

`npm run test:e2e -- e2e/admin.spec.ts` 只跑后台的测试：后台写的是一份临时副本（`.e2e-admin-root`），不会动真正的文件；
GitHub 的提交流程用假的接口测，不会真的推送。
