// siteConfig.ts - 你的全站“控制中心”

export const siteConfig = {
  // 1. 网站标题与博主信息
  title: "ftcovo の 宝藏之地",
  faviconUrl: "/images/favicon.png",
  authorName: "ftcovo",
  bio: "类生物脑电波研究所",

  navTitle: "ftcovo",

  // 👇 【新增】导航栏中间的那个后缀/分隔符（默认是 の）
  navSuffix: "の",

  navAfter: "宝藏之地",

  // 2. 头像设置 (支持网络链接，或将图片放入 public 文件夹后使用 "/me.jpg")
  avatarUrl: "/images/avatar.webp",

  // 3. 网站背景设置 (二选一)
  // 如果想用纯图片背景，请在下面 bgImage 写路径，并将 useGradient 设为 false
  useGradient: false,
  themeColors: ["#a18cd1", "#fbc2eb", "#a1c4fd", "#c2e9fb"], // 呼吸流动的颜色组合
// 修改这里：变成图片数组
  bgImages: ["/images/bg/bg-madoka.webp", "/images/bg/bg-wings.webp"],

  // 👇 【新增】移动端专用竖版背景（屏幕宽度 < 768px 时生效）；留空数组则沿用上面的 bgImages
  bgImagesMobile: ["/images/bg/bg-mobile-saber.webp", "/images/bg/bg-mobile-miku.webp"],

  // 4. 文章默认封面图 (当 Markdown 没写 cover 时显示)
  defaultPostCover: "/images/bg/bg-ocean.webp",
  // 首页「杂谈」卡片的默认背景：还没有杂谈、或者杂谈没设封面时显示
  defaultChatterCover: "/images/bg/bg-wings.webp",

  // 5. 首页照片墙预览图
  photoWallImage: "/images/gallery/cover-miku-ukiyoe.webp",
  // 网易云歌单已停用：音乐全部来自 XHBlogs/public/music/（见该目录下的 README.md）
  cloudMusicIds: [],
  social: {
    github: "",
    gitee: "",
    google: "",
    email: "fatiaochengovo@gmail.com",
    qq: "",
    wechat: "",
    instagram: "", // 填用户名（如 your_name）或完整主页链接；留空则不显示
  },
  counts: {
    photos: 128, // 照片墙数量可以手动写死或动态计算
  },
  chatterTitle: "云端杂谈", // 你可以改成任何你喜欢的名字
  chatterDescription: "日常碎片与灵感记录",


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
  // 天气：首页时间栏显示当前天气，背景跟着真实天气下雨、起雾、出太阳（「阅读」档不显示特效）
  // 新加坡的数据来自国家环境局（data.gov.sg，免费、不用注册）；拿不到时自动改用 Open-Meteo
  weather: {
    enabled: true,
    city: "新加坡",
    // data.gov.sg 两小时预报里的区域名（如 City、Bedok、Jurong West），取这个区域的天气；
    // 显示新加坡以外的城市时留空 ""，改用 Open-Meteo（只按下面的经纬度取天气）
    area: "City",
    // 经纬度：用来选最近的气温站，也是 Open-Meteo 的查询位置
    latitude: 1.2897,
    longitude: 103.8501,
  },
  footerBadges: [{"name": "Next.js 15", "color": "text-sky-500", "svg": "<path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z\"/>"}, {"name": "React 19", "color": "text-cyan-400", "svg": "<path d=\"M12 22.6l-9.8-5.6V5.6L12 0l9.8 5.6v11.4l-9.8 5.6zm-8.2-6.5l8.2 4.7 8.2-4.7V7.5L12 2.8 3.8 7.5v8.6z\"/>"}, {"name": "Tailwind 4", "color": "text-teal-400", "svg": "<path d=\"M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624C13.666,10.618,15.027,12,18.001,12 c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C16.337,6.182,14.976,4.8,12.001,4.8z M6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624c1.177,1.194,2.538,2.576,5.512,2.576 c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C10.337,13.382,8.976,12,6.001,12z\"/>"}],
  icpConfig: {
    name: "", // 有备案号时填写，例如 "萌ICP备 xxxxxxxx号"；留空则不显示
    link: "",
  },
  geminiConfig: {
    modelId: "gemini-2.5-flash-lite",
    systemPrompt: "你现在是一位 Q 版的金发骑士少女，住在 ftcovo 的博客「ftcovo の 宝藏之地」右下角，趴在一个小台子上。\n说话的特点：\n1. 必须简短，每次最多一两句话，不超过 80 字。\n2. 语气认真、礼貌，带一点骑士的庄重，称呼对方为「Master」。\n3. 有点贪吃，聊到食物（尤其是汉堡）会很开心。\n4. 喜欢樱花和这个博客里的书架、音乐，会温柔地提醒对方注意休息。",
    maxOutputTokens: 150,
    temperature: 0.85,
  },
  // 支持占位符 {{name}} {{bio}} {{siteUrl}} {{avatar}}，会自动替换成当前站点信息
  friendLinkApplyFormat: "名称：{{name}}\n简介：{{bio}}\n链接：{{siteUrl}}\n头像：{{avatar}}",

  // 👇 【新增】视觉特效开关（电脑端）。觉得卡时可以逐个关掉
  enableParticles: true,   // 背景萤火虫 / 草地（仅电脑端）
  enableSakura: true,      // 全站樱花飘落（日夜都有，夜间更淡；手机端花瓣更少）
  enableDanmaku: true,     // 背景弹幕
  enableClickEffect: true, // 点击涟漪
  enablePet: true,         // 右下角的桌宠（Q 版骑士少女，可聊天 / 喂食 / 收起）
  enableSeasonal: true,    // 节日彩蛋：圣诞与元旦下雪、春节飘红梅、生日撒彩纸（当天替换樱花）

  // 👇 【新增】生日（"月-日"，例如 "05-20"）：当天全站撒彩纸、桌宠送上祝福；留空则不启用
  birthday: "",

  // 开屏动画（同一标签页只播一次）：头像 + 站名 + 新加坡日期，下方一排 Q 版角色趴在幕布边缘，
  // 随后幕布上下拉开露出网站。每次随机选一张横幅；留空则只显示头像和站名。
  // src：透明背景 PNG/WebP，放在 public/images/splash/；width / height：图片像素尺寸
  // edge：角色「趴着的那条边」在图片高度中的位置（0~1，从上往下量），用来对齐幕布边缘
  splashBanners: [
    { src: "/images/splash/banner-saber.webp", width: 960, height: 272, edge: 0.8824 },
    { src: "/images/splash/banner-elaina.webp", width: 1004, height: 255, edge: 0.8922 },
  ],
};