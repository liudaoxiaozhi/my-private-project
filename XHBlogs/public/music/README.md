# 本地音乐

把音频文件放进这个文件夹，`npm run dev` / `npm run build` 时会自动生成歌单（`playlist.json`），无需改任何配置。

## 命名规则

```
01. YOASOBI - 夜に駆ける.mp3    音频（必需）：可选序号 + 「歌手 - 歌名」
01. YOASOBI - 夜に駆ける.lrc    歌词（可选）：与音频同名
01. YOASOBI - 夜に駆ける.jpg    封面（可选）：与音频同名，支持 jpg / jpeg / png / webp
```

- 开头的序号（`01.`、`02_`、`03)`）只决定播放顺序，不会显示。
- 没有「 - 」时，整个文件名作为歌名。
- 推荐 mp3（128–192 kbps，单首约 3–6 MB）或 m4a；flac / wav 体积太大，ogg / opus 在旧版 Safari 上放不了。

## 播放顺序

本地歌曲排在前面，`siteConfig.ts` 里的网易云 `cloudMusicIds` 排在后面。任意一首加载失败会自动跳到下一首。
