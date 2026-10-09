// lib/server/admin/music.ts —— 后台的歌曲管理：public/music/ 下的音频文件（仅服务端）
//
// 网站的歌单在构建时由 scripts/build-music-manifest.mjs 扫描这个目录生成（按文件名排序），所以：
// - 顺序 = 文件名前面的序号（01. 02. …）；排序、置顶就是重新编号改名，同名的封面 / 歌词跟着一起改
// - 文件名格式「序号. 歌手 - 歌名.mp3」；同名的 .jpg/.png/.webp 是封面，同名 .lrc 是歌词
// - 显示用的歌名 / 歌手优先取上次构建生成的 playlist.json（里面有音频内嵌标签读出来的信息）
import { AdminInputError } from './api';
import { getStorage } from './storage';
import type { Change } from './storage';

const DIR = 'public/music';
const AUDIO_EXT = ['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wav'];
const COVER_EXT = ['.webp', '.jpg', '.jpeg', '.png'];

export interface Song {
  /** 音频文件名（含序号和扩展名），当作 id 用 */
  file: string;
  title: string;
  artist: string;
  /** 封面（同名图片）文件名 */
  cover: string | null;
  /** 歌词（同名 .lrc）文件名 */
  lyrics: string | null;
  size: number;
}

const extOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
};
const baseOf = (name: string): string => name.slice(0, name.length - extOf(name).length);
const stripIndex = (base: string): string => base.replace(/^\d{1,3}[._)]\s*/, '').trim();

function parseName(base: string): { artist: string; title: string } {
  const rest = stripIndex(base);
  const sep = rest.indexOf(' - ');
  return sep === -1 ? { artist: '', title: rest || base } : { artist: rest.slice(0, sep).trim(), title: rest.slice(sep + 3).trim() || rest };
}

const byName = (a: string, b: string): number => a.localeCompare(b, 'zh-Hans-CN', { numeric: true });

/** 文件名里不能出现的字符换成空格 */
const safePart = (text: string): string => text.replace(/[\\/:*?"<>|#%\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

async function scan(): Promise<{ songs: Song[] }> {
  const storage = getStorage();
  const entries = (await storage.list(DIR)).filter((e) => e.type === 'file');
  const files = new Set(entries.map((e) => e.name));
  let manifest: Record<string, { title?: string; artist?: string }> = {};
  try {
    const raw = await storage.readText(`${DIR}/playlist.json`);
    const tracks = raw ? ((JSON.parse(raw) as { tracks?: { id?: string; title?: string; artist?: string }[] }).tracks ?? []) : [];
    manifest = Object.fromEntries(tracks.filter((t) => t.id?.startsWith('local:')).map((t) => [t.id!.slice(6), t]));
  } catch {
    /* 歌单还没生成过 */
  }
  const songs = entries
    .filter((e) => AUDIO_EXT.includes(extOf(e.name)))
    .map((e) => e.name)
    .sort(byName)
    .map((file) => {
      const base = baseOf(file);
      const fromName = parseName(base);
      const known = manifest[file];
      const size = entries.find((e) => e.name === file)?.size ?? 0;
      return {
        file,
        title: known?.title || fromName.title,
        artist: known?.artist || fromName.artist,
        cover: COVER_EXT.map((ext) => base + ext).find((n) => files.has(n)) ?? null,
        lyrics: files.has(`${base}.lrc`) ? `${base}.lrc` : null,
        size,
      };
    });
  return { songs };
}

export async function listSongs(): Promise<Song[]> {
  return (await scan()).songs;
}

/** 这首歌的音频 + 同名封面 + 歌词 */
function familyOf(song: Song): string[] {
  return [song.file, song.cover, song.lyrics].filter((n): n is string => n !== null);
}

const width = (count: number): number => Math.max(2, String(count).length);
const pad = (n: number, w: number): string => String(n).padStart(w, '0');

function renamedBase(song: Song, index: number, total: number): string {
  return `${pad(index + 1, width(total))}. ${stripIndex(baseOf(song.file))}`;
}

/** 按给定顺序重新编号：返回需要的改名操作（skip：还不存在的新歌，只占位置） */
function renumber(order: Song[], skip?: Song): Change[] {
  const changes: Change[] = [];
  order.forEach((song, i) => {
    if (song === skip) return;
    const oldBase = baseOf(song.file);
    const newBase = renamedBase(song, i, order.length);
    if (newBase === oldBase) return;
    for (const name of familyOf(song)) changes.push({ path: `${DIR}/${newBase}${name.slice(oldBase.length)}`, from: `${DIR}/${name}` });
  });
  return changes;
}

export async function reorderSongs(files: unknown): Promise<{ sha: string | null }> {
  const { songs } = await scan();
  if (!Array.isArray(files) || files.length !== songs.length || new Set(files).size !== songs.length) {
    throw new AdminInputError('歌单已经变了，刷新一下再排');
  }
  const order = files.map((f) => {
    const song = songs.find((s) => s.file === f);
    if (!song) throw new AdminInputError('歌单已经变了，刷新一下再排');
    return song;
  });
  const changes = renumber(order);
  if (changes.length === 0) return { sha: null };
  return getStorage().commit(changes, '后台：调整歌曲顺序');
}

export async function deleteSong(file: string): Promise<{ sha: string | null }> {
  const { songs } = await scan();
  const index = songs.findIndex((s) => s.file === file);
  if (index === -1) throw new AdminInputError('这首歌已经不在了');
  const song = songs[index];
  const rest = songs.filter((_, i) => i !== index);
  const changes: Change[] = [...familyOf(song).map((name) => ({ path: `${DIR}/${name}`, delete: true as const })), ...renumber(rest)];
  return getStorage().commit(changes, `后台：删除歌曲「${song.title}」`);
}

export interface SongUpload {
  title: string;
  artist: string;
  /** 音频：暂存 id + 扩展名 */
  audio: { staged: string; ext: string };
  cover?: { staged: string; ext: string };
  /** LRC 歌词全文 */
  lyrics?: string;
  /** 放到最前面（默认加在最后） */
  first?: boolean;
}

function checkExt(ext: unknown, allowed: string[], label: string): string {
  const e = typeof ext === 'string' ? ext.toLowerCase() : '';
  if (!allowed.includes(e)) throw new AdminInputError(`${label}格式不支持（可用：${allowed.join(' ')}）`);
  return e;
}

export async function addSong(input: SongUpload): Promise<{ sha: string | null; file: string }> {
  const title = safePart(String(input.title ?? ''));
  const artist = safePart(String(input.artist ?? ''));
  if (!title) throw new AdminInputError('请填写歌名');
  if (typeof input.audio?.staged !== 'string') throw new AdminInputError('请先上传音频文件');
  const audioExt = checkExt(input.audio.ext, AUDIO_EXT, '音频');

  const { songs } = await scan();
  const name = artist ? `${artist} - ${title}` : title;
  if (songs.some((s) => stripIndex(baseOf(s.file)) === name)) throw new AdminInputError(`歌单里已经有「${name}」了`);

  // 新歌先占一个位置，再整体重新编号（放最前时其余的歌往后挪）
  const placeholder: Song = { file: `00. ${name}${audioExt}`, title, artist, cover: null, lyrics: null, size: 0 };
  const order = input.first ? [placeholder, ...songs] : [...songs, placeholder];
  const base = renamedBase(placeholder, order.indexOf(placeholder), order.length);
  const changes: Change[] = [...renumber(order, placeholder), { path: `${DIR}/${base}${audioExt}`, staged: input.audio.staged }];
  if (input.cover) changes.push({ path: `${DIR}/${base}${checkExt(input.cover.ext, COVER_EXT, '封面')}`, staged: input.cover.staged });
  if (input.lyrics?.trim()) changes.push({ path: `${DIR}/${base}.lrc`, content: `${input.lyrics.trim()}\n` });
  const { sha } = await getStorage().commit(changes, `后台：添加歌曲「${title}」`);
  return { sha, file: `${base}${audioExt}` };
}

export interface SongEdit {
  file: string;
  title?: string;
  artist?: string;
  cover?: { staged: string; ext: string } | null;
  lyrics?: string | null;
}

/** 改歌名 / 歌手（文件改名）、换封面、改歌词；cover / lyrics 为 null 表示删掉 */
export async function editSong(input: SongEdit): Promise<{ sha: string | null }> {
  const { songs } = await scan();
  const index = songs.findIndex((s) => s.file === input.file);
  if (index === -1) throw new AdminInputError('这首歌已经不在了');
  const song = songs[index];
  const oldBase = baseOf(song.file);
  const fromName = parseName(oldBase);
  const title = input.title !== undefined ? safePart(input.title) : fromName.title;
  const artist = input.artist !== undefined ? safePart(input.artist) : fromName.artist;
  if (!title) throw new AdminInputError('歌名不能为空');
  const prefix = /^\d{1,3}[._)]\s*/.exec(oldBase)?.[0] ?? '';
  const newBase = `${prefix}${artist ? `${artist} - ${title}` : title}`;

  const changes: Change[] = [];
  const move = (name: string) => {
    const target = `${newBase}${name.slice(oldBase.length)}`;
    if (target !== name) changes.push({ path: `${DIR}/${target}`, from: `${DIR}/${name}` });
  };
  move(song.file);
  if (input.cover === undefined && song.cover) move(song.cover);
  if (input.lyrics === undefined && song.lyrics) move(song.lyrics);
  if (input.cover !== undefined) {
    if (song.cover) changes.push({ path: `${DIR}/${song.cover}`, delete: true });
    if (input.cover) changes.push({ path: `${DIR}/${newBase}${checkExt(input.cover.ext, COVER_EXT, '封面')}`, staged: input.cover.staged });
  }
  if (input.lyrics !== undefined) {
    if (song.lyrics) changes.push({ path: `${DIR}/${song.lyrics}`, delete: true });
    if (input.lyrics?.trim()) changes.push({ path: `${DIR}/${newBase}.lrc`, content: `${input.lyrics.trim()}\n` });
  }
  if (changes.length === 0) return { sha: null };
  return getStorage().commit(changes, `后台：修改歌曲「${title}」`);
}

export async function readLyrics(file: string): Promise<string> {
  const { songs } = await scan();
  const song = songs.find((s) => s.file === file);
  if (!song?.lyrics) return '';
  return (await getStorage().readText(`${DIR}/${song.lyrics}`)) ?? '';
}
