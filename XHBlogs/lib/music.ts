// lib/music.ts —— 音乐相关的共享类型（客户端 / 服务端通用，无运行时依赖）
// 歌曲全部来自 public/music/，由 scripts/build-music-manifest.mjs 生成歌单

/** 一行已解析的歌词；time 单位为秒，-1 表示没有时间轴的纯文本歌词（只显示、不滚动高亮） */
export interface LyricLine {
  time: number;
  text: string;
}

/** scripts/build-music-manifest.mjs 生成的本地歌单条目（public/music/playlist.json） */
export interface LocalTrack {
  id: string;
  title: string;
  /** 文件名里没有「歌手 - 」时为空字符串 */
  artist: string;
  src: string;
  cover?: string;
  /** 同名 .lrc 歌词地址，播放到该曲时再按需加载 */
  lrcUrl?: string;
}

export interface LocalPlaylistManifest {
  tracks: LocalTrack[];
}

/** 目前只有本地音乐；保留字段方便以后接入其他来源 */
export type SongSource = 'local';

/** 播放器内部使用的歌曲 */
export interface Song {
  id: string;
  source: SongSource;
  title: string;
  artist: string;
  cover: string;
  /** 音频地址 */
  src: string;
  /** 已解析好的歌词，可能为空数组 */
  lyrics: LyricLine[];
  /** 尚未加载的歌词地址（本地歌曲），加载后写入 lyrics */
  lrcUrl?: string;
}
