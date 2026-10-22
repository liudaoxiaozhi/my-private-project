# 端到端测试（e2e）

用真实浏览器把整站点一遍：文章渲染、换页动画、前进后退、特效档位、工具箱、命令面板、桌宠和各种彩蛋。
改完前端、准备推送之前跑一下，能提前发现「点了没反应」「动画卡住」「页面报错」这类问题。

## 第一次使用

```bash
cd XHBlogs
npm install
npx playwright install chromium   # 下载测试用的浏览器，只需要一次
```

## 运行

```bash
npm run test:e2e                          # 全部测试（会先构建，大约 5 分钟）
npm run test:e2e -- e2e/article.spec.ts   # 只跑一个文件
npm run test:e2e -- -g "命令面板"          # 只跑名字里带「命令面板」的用例
npm run test:e2e -- --no-build            # 刚构建过、只改了测试时跳过构建
npx playwright show-report                # 打开上次的测试报告（失败的用例有截图和操作录像）
```

`npm run test:e2e` 会自动：

1. 把 `e2e/fixtures/` 里的测试用文章、杂谈临时复制进 `posts/`、`chatters/`
2. 构建到单独的 `.next-e2e/` 目录（不影响平时 `npm run build` 的 `.next/`）
3. 在 3123 端口启动网站并运行测试
4. 结束后（不管成功失败）删掉复制进去的测试内容

测试内容的文件名都以 `zz-e2e-` 开头，已经写进 `.gitignore`，万一中途强行关掉没来得及删，也不会被提交。

## 文件

| 文件 | 测什么 |
| --- | --- |
| `article.spec.ts` | 文章：代码块复制 / 展开、提示框、黑幕、脚注、灯箱、目录、阅读设置、续读、读完庆祝、手机端 |
| `navigation.spec.ts` | 换页：入场动画、封面过渡、进度条、前进 / 后退的方向和滚动位置、日夜切换、404 |
| `effects.spec.ts` | 特效档位（完整 / 简洁 / 阅读）、卡片光效和倾斜、滚动浮现 |
| `toolbox.spec.ts` | 工具箱：白噪音、今日御神签、召回桌宠 |
| `easter-eggs.spec.ts` | ⌘K 命令面板、控制台 / 标题 / 科乐美秘籍彩蛋、节日飘落、桌宠的招呼 / 瞌睡 / 生气 |
| `weather.spec.ts` | 天气：NEA / Open-Meteo 数据解析（模拟响应）、首页时间栏、雨 / 雷 / 雾等特效、桌宠和命令面板联动 |
| `media.spec.ts` | 书影音：/anime 跳转、分类筛选和文案（想读 / 读过）、想看清单排序、登录后「开始读」 |
| `self-host.spec.ts` | 自己的服务器：后台保存后自动重建（排队 → 重建中 → 已上线）、概览里的「立即重建」（真正的构建换成不到 1 秒的假命令，见 `playwright.config.ts`） |
| `support.ts` | 共用的准备工作（跳过开屏、默认主题、页面报错检查） |
| `fixtures/` | 测试用的文章和杂谈；`fixtures/data/` 里的数据文件（如书影音的 `anime.json`）测试时临时替换 `data/` 里的同名文件 |

## 注意

- 每个用例结束时都会检查页面有没有报错；网络层面的失败（外链图片加载不了、评论区连不上 GitHub）不算。
- 书架是空的时候，相关用例会自动跳过。
- 天气相关的页面用例用模拟数据，不需要连得上 data.gov.sg；想看真实效果可以打开 `/?weather=rain`（或 thunder、fog、haze、clear、snow…）预览。
- 站点关掉了桌宠（`siteConfig.enablePet = false`）时，桌宠相关的用例会失败，可以用 `-g` 跳过或者不管它。
