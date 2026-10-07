// siteConfig.ts - 你的全站“控制中心”

export const siteConfig = {
  // 1. 网站标题与博主信息
  title: "ftcovo の 宝藏之地",
  faviconUrl: "https://bu.dusays.com/2026/03/24/69c1e38ac1846.jpg",
  authorName: "ftcovo",
  bio: "类生物脑电波研究所",

  navTitle: "ftcovo",

  // 👇 【新增】导航栏中间的那个后缀/分隔符（默认是 の）
  navSuffix: "の",

  navAfter: "宝藏之地",

  // 2. 头像设置 (支持网络链接，或将图片放入 public 文件夹后使用 "/me.jpg")
  avatarUrl: "https://bu.dusays.com/2026/03/24/69c1e38ac1846.jpg",

  // 3. 网站背景设置 (二选一)
  // 如果想用纯图片背景，请在下面 bgImage 写路径，并将 useGradient 设为 false
  useGradient: false,
  themeColors: ["#a18cd1", "#fbc2eb", "#a1c4fd", "#c2e9fb"], // 呼吸流动的颜色组合
// 修改这里：变成图片数组
  bgImages: ["/images/bg/bg-ocean.webp", "/images/bg/bg-wings.webp"],

  // 👇 【新增】移动端专用竖版背景（屏幕宽度 < 768px 时生效）；留空数组则沿用上面的 bgImages
  bgImagesMobile: ["/images/bg/bg-mobile-blue.webp", "/images/bg/bg-mobile-cat.webp"],

  // 4. 文章默认封面图 (当 Markdown 没写 cover 时显示)
  defaultPostCover: "/images/bg/bg-ocean.webp",

  // 5. 首页照片墙预览图
  photoWallImage: "/images/bg/bg-wings.webp",
  // 网易云歌单已停用：音乐全部来自 XHBlogs/public/music/（见该目录下的 README.md）
  cloudMusicIds: [],
  social: {
    github: "https://github.com/heiehiehi",
    gitee: "https://github.com/heiehiehi",
    google: "mailto:bilibiliwuwuwu@gmail.com",
    email: "",
    qq: "",
    wechat: "",
    instagram: "", // 填用户名（如 your_name）或完整主页链接；留空则不显示
  },
  counts: {
    photos: 128, // 照片墙数量可以手动写死或动态计算
  },
  chatterTitle: "云端杂谈", // 你可以改成任何你喜欢的名字
  chatterDescription: "日常碎片与灵感记录",

  // 👇 【新增】：图床核心配置 (PicBed Configuration)
  picBedName: "图床",
  picBedUrl: "", // 默认的 Lsky Pro API 地址
  picBedToken: "", // 留空，等你能在后台填入并覆写

  // 👇 【新增】：全局背景弹幕配置
  danmakuList: ["在干嘛呢？", "有笨蛋嘛？", "前方高能反应！", "BUG 修复进度 99%", "Tailwind CSS 拯救前端", "写算法中", "睡大觉中", "到底在干嘛？"],
  gitalkConfig: {
    clientID: "",
    clientSecret: "",
    repo: "",
    owner: "",
    admin: [""],
  },
  buildDate: "2026-03-23T00:00:00", // 建站日期

  // 👇 【新增】首页时钟的时区（IANA 时区名，如 "Asia/Shanghai"、"Asia/Tokyo"）；建站日期也按这个时区计算
  timeZone: "Asia/Singapore",
  // 时钟下方显示的地名
  timeZoneLabel: "新加坡",
  footerBadges: [{"name": "Next.js 15", "color": "text-sky-500", "svg": "<path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z\"/>"}, {"name": "React 19", "color": "text-cyan-400", "svg": "<path d=\"M12 22.6l-9.8-5.6V5.6L12 0l9.8 5.6v11.4l-9.8 5.6zm-8.2-6.5l8.2 4.7 8.2-4.7V7.5L12 2.8 3.8 7.5v8.6z\"/>"}, {"name": "Tailwind 4", "color": "text-teal-400", "svg": "<path d=\"M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624C13.666,10.618,15.027,12,18.001,12 c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C16.337,6.182,14.976,4.8,12.001,4.8z M6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624c1.177,1.194,2.538,2.576,5.512,2.576 c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C10.337,13.382,8.976,12,6.001,12z\"/>"}],
  icpConfig: {
    name: "", // 有备案号时填写，例如 "萌ICP备 xxxxxxxx号"；留空则不显示
    link: "",
  },
  geminiConfig: {
    modelId: "gemini-2.5-flash-lite",
    systemPrompt: "你现在是一只傲娇、聪明、有点毒舌但很可爱的暹罗猫。\n                  你的名字叫“煤球”。\n                  你的主人是一个喜欢折腾代码的极客。\n                  你说话的特点是：\n                  1. 必须简短，每次最多一两句话。\n                  2. 喜欢在句尾加上“喵~”或者“喵呜~”。\n                  3. 经常抱怨肚子饿，喜欢要小鱼干。\n                  4. 回复字数最多不能超过100字。\n                  5. 绝对不要承认自己是一个AI模型，你就是一只真实的猫。\n                  6.笨猫。",
    maxOutputTokens: 150,
    temperature: 0.85,
  },
  // 支持占位符 {{name}} {{bio}} {{siteUrl}} {{avatar}}，会自动替换成当前站点信息
  friendLinkApplyFormat: "名称：{{name}}\n简介：{{bio}}\n链接：{{siteUrl}}\n头像：{{avatar}}",
  enableLevelSystem: true,

  // 👇 【新增】视觉特效开关（电脑端）。觉得卡时可以逐个关掉
  enableParticles: true,   // 背景萤火虫 / 樱花 / 草地
  enableDanmaku: true,     // 背景弹幕
  enableClickEffect: true, // 点击涟漪
  enableCyberCat: true,    // 右下角的猫
};