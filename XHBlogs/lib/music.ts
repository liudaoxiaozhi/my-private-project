// lib/music.ts —— 音乐相关的共享类型（客户端 / 服务端通用，无运行时依赖）
// 歌曲来自两处：网易云（data/netease.json，后台导入）和本地上传（public/music/，由 scripts/build-music-manifest.mjs 生成歌单）

/** 逐字歌词里的一个字（或一个英文单词），时间单位为秒 */
export interface LyricWord {
  start: number;
  end: number;
  text: string;
}

/** 一行已解析的歌词；time 单位为秒，-1 表示没有时间轴的纯文本歌词（只显示、不滚动高亮） */
export interface LyricLine {
  time: number;
  text: string;
  /** 这一行的译文（同一时间戳的第二行，或网易云的翻译歌词） */
  translation?: string;
  /** 网易云逐字歌词（yrc）里每个字的时间；没有时由页面按整行时长估算 */
  words?: LyricWord[];
  /** 这一行唱完的时间（逐字歌词才有） */
  end?: number;
}

/** /api/music/lyric 返回的原始歌词：LRC、逐字歌词（yrc）、翻译（LRC 格式），没有的为空字符串 */
export interface NeteaseLyricPayload {
  lrc: string;
  yrc: string;
  translation: string;
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

export type SongSource = 'local' | 'netease';

/** data/netease.json 里的一首网易云歌曲（后台导入时查好的信息） */
export interface NeteaseTrack {
  id: number;
  title: string;
  artist: string;
  cover: string;
  /** 0 / 8：免费；1：VIP；4：需要购买专辑（这两种外链通常放不了） */
  fee: number;
}

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
