// 🛡️ 本文件由 XingHuiSama 控制台自动生成，请勿手动修改
export interface Photo { url: string; caption?: string; }
export interface Album { id: string; title: string; description: string; cover: string; date: string; photos: Photo[]; }

export const albums: Album[] = [
  {
    id: "illustrations",
    title: "插画收藏",
    description: "喜欢的插画，版权归原画师所有",
    cover: "/images/gallery/cover-miku-ukiyoe.webp",
    date: "2026-10-07",
    photos: [
      { url: "/images/bg/bg-mobile-miku.webp", caption: "浮世绘初音（原图带画师签名）" },
      { url: "/images/gallery/yunayuispink-girl.webp", caption: "画师 @yunayuispink" },
      { url: "/images/bg/bg-madoka.webp", caption: "魔法少女小圆" },
      { url: "/images/bg/bg-mobile-saber.webp", caption: "Saber" }
    ]
  }
];
