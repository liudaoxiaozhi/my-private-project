// lib/server/netease.ts —— 网易云音乐：按歌曲 ID / 歌单 ID 查歌曲信息、取歌词（仅服务端）
//
// 用的是网页版的公开接口（不需要登录）。歌曲信息在后台导入时查一次存进 data/netease.json；
// 播放时浏览器直接用官方外链 music.163.com/song/media/outer/url?id=…，歌词由 /api/music/lyric 代取。
// 注意：VIP / 付费歌曲（fee 为 1 或 4）外链通常放不了或只有 30 秒；部分歌曲有地区限制。
import { outboundFetch } from './outboundFetch';

export interface NeteaseSong {
  id: number;
  title: string;
  artist: string;
  /** 封面（网易云图床，已限定 400×400） */
  cover: string;
  /** 0 / 8：免费；1：VIP；4：需要购买专辑 */
  fee: number;
  /** 毫秒 */
  duration: number;
}

export class NeteaseError extends Error {}

/** 接口地址：默认官方；网络到不了时可以用 NETEASE_API_BASE 换成自己的反代（测试里指向假的网易云） */
const API_BASE = (process.env.NETEASE_API_BASE ?? '').trim().replace(/\/+$/, '') || 'https://music.163.com';

const HEADERS = {
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

/** 一次最多导入的歌曲数 */
export const MAX_SONGS = 500;

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await outboundFetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new NeteaseError('连不上网易云音乐，稍后再试');
  }
  if (!res.ok) throw new NeteaseError(`网易云音乐接口出错（${res.status}）`);
  const data = (await res.json()) as T & { code?: number };
  if (typeof data.code === 'number' && data.code !== 200) throw new NeteaseError(`网易云音乐返回错误（code ${data.code}）`);
  return data;
}

/** 新旧两种接口的歌曲字段都认：artists / ar、album / al */
interface RawSong {
  id?: number;
  name?: string;
  artists?: { name?: string }[];
  ar?: { name?: string }[];
  album?: { picUrl?: string };
  al?: { picUrl?: string };
  fee?: number;
  duration?: number;
  dt?: number;
}

function toSong(raw: RawSong): NeteaseSong | null {
  if (typeof raw.id !== 'number' || !raw.name) return null;
  const artists = (raw.ar ?? raw.artists ?? []).map((a) => a.name).filter(Boolean).join(' / ');
  const pic = (raw.al ?? raw.album)?.picUrl ?? '';
  return {
    id: raw.id,
    title: raw.name,
    artist: artists,
    cover: pic ? `${pic.replace(/^http:/, 'https:')}?param=400y400` : '',
    fee: typeof raw.fee === 'number' ? raw.fee : 0,
    duration: raw.dt ?? raw.duration ?? 0,
  };
}

/** 按 ID 查歌曲信息（保持传入的顺序，查不到的跳过） */
export async function songDetails(ids: number[]): Promise<NeteaseSong[]> {
  const unique = [...new Set(ids)].slice(0, MAX_SONGS);
  const found = new Map<number, NeteaseSong>();
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const data = await getJson<{ songs?: RawSong[] }>(`${API_BASE}/api/song/detail/?ids=${encodeURIComponent(`[${chunk.join(',')}]`)}`);
    for (const raw of data.songs ?? []) {
      const song = toSong(raw);
      if (song) found.set(song.id, song);
    }
  }
  return unique.map((id) => found.get(id)).filter((s): s is NeteaseSong => !!s);
}

/** 歌单里的全部歌曲（最多 MAX_SONGS 首） */
export async function playlistSongs(id: number): Promise<{ name: string; songs: NeteaseSong[] }> {
  const data = await getJson<{ playlist?: { name?: string; trackIds?: { id: number }[]; tracks?: RawSong[] } }>(
    `${API_BASE}/api/v6/playlist/detail?id=${id}&n=${MAX_SONGS}`,
  );
  const playlist = data.playlist;
  if (!playlist) throw new NeteaseError('找不到这个歌单（可能是私密歌单）');
  const ids = (playlist.trackIds ?? []).map((t) => t.id).filter((n) => typeof n === 'number');
  // trackIds 有全部歌曲；tracks 只带前一部分的详情，不够的再按 ID 查
  const known = new Map((playlist.tracks ?? []).map(toSong).filter((s): s is NeteaseSong => !!s).map((s) => [s.id, s]));
  const missing = ids.filter((n) => !known.has(n));
  for (const song of missing.length ? await songDetails(missing) : []) known.set(song.id, song);
  const order = ids.length ? ids : [...known.keys()];
  return { name: playlist.name ?? '', songs: order.slice(0, MAX_SONGS).map((n) => known.get(n)).filter((s): s is NeteaseSong => !!s) };
}

/** LRC 歌词；有翻译时把译文合并在原文下一行（同一时间戳）；纯音乐 / 没有歌词时返回空字符串 */
export async function lyric(id: number): Promise<string> {
  const data = await getJson<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string }; nolyric?: boolean }>(
    `${API_BASE}/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1`,
  );
  if (data.nolyric) return '';
  const original = data.lrc?.lyric ?? '';
  const translated = data.tlyric?.lyric ?? '';
  if (!translated.trim()) return original;
  // 译文按时间戳挂到原文后面
  const byStamp = new Map<string, string>();
  for (const line of translated.split(/\r?\n/)) {
    const m = /^(\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])(.*)$/.exec(line.trim());
    if (m && m[2].trim()) byStamp.set(m[1], m[2].trim());
  }
  return original
    .split(/\r?\n/)
    .map((line) => {
      const m = /^(\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])(.*)$/.exec(line.trim());
      const t = m && byStamp.get(m[1]);
      return t ? `${line.trim()}\n${m![1]}${t}` : line;
    })
    .join('\n');
}

/**
 * 从用户粘贴的内容里认出歌曲 / 歌单 ID：
 * 支持纯数字（逗号、空格、换行分隔）、music.163.com 的歌曲 / 歌单链接（含 #/ 形式）、手机 App 分享的链接
 */
export function parseNeteaseInput(text: string, fallback: 'song' | 'playlist'): { songs: number[]; playlists: number[] } {
  const songs: number[] = [];
  const playlists: number[] = [];
  for (const token of text.split(/[\s,，;；]+/).filter(Boolean)) {
    const link = /(song|playlist)\?(?:[^#\s]*&)?id=(\d+)/.exec(token) ?? /\/(song|playlist)\/(\d+)/.exec(token);
    if (link) (link[1] === 'song' ? songs : playlists).push(Number(link[2]));
    else if (/^\d{1,12}$/.test(token)) (fallback === 'song' ? songs : playlists).push(Number(token));
  }
  return { songs: [...new Set(songs)], playlists: [...new Set(playlists)] };
}
