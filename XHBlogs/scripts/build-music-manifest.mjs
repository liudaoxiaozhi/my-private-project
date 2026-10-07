#!/usr/bin/env node
// scripts/build-music-manifest.mjs —— 扫描 public/music/，生成本地歌单 public/music/playlist.json
//
// 在 `npm run dev` / `npm run build` 前自动执行（见 package.json），无需任何配置：
//   public/music/
//   ├── 01. YOASOBI - 夜に駆ける.mp3   ← 文件名：可选序号 + 「歌手 - 歌名」
//   ├── 01. YOASOBI - 夜に駆ける.lrc   ← 可选：同名歌词
//   └── 01. YOASOBI - 夜に駆ける.jpg   ← 可选：同名封面（jpg / jpeg / png / webp）
//
// 还会读取音频文件内嵌的标签（ID3 / FLAC / M4A）：歌名、歌手、封面、歌词。
// 优先级：同名文件 > 内嵌标签 > 文件名。内嵌封面和歌词会导出到 _covers/、_lyrics/ 供网页加载。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MUSIC_DIR = path.join(process.cwd(), 'public', 'music');
const COVER_DIR = path.join(MUSIC_DIR, '_covers');
const LYRICS_DIR = path.join(MUSIC_DIR, '_lyrics');
const MANIFEST = path.join(MUSIC_DIR, 'playlist.json');
const PUBLIC_PREFIX = '/music/';

/** 浏览器普遍支持的音频格式（ogg/opus 在旧版 Safari 上不可用，flac/wav 体积较大，不建议） */
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wav']);
const COVER_EXT = ['.webp', '.jpg', '.jpeg', '.png'];
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
/** ID3 SYLT 的时间戳单位：2 = 毫秒（1 = MPEG 帧号，几乎没人用，忽略） */
const TIMESTAMP_MILLISECONDS = 2;

/** 每个路径段单独编码，保证中文、日文、空格、# 等字符在 URL 中安全 */
const toUrl = (...segments) => PUBLIC_PREFIX + segments.map(encodeURIComponent).join('/');
const shortHash = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
const pad = (n, len = 2) => String(n).padStart(len, '0');

/**
 * "01. YOASOBI - 夜に駆ける" → { artist: "YOASOBI", title: "夜に駆ける" }
 * 没有「 - 」时整个文件名作为歌名。序号只用于排序，不显示。
 */
function parseName(baseName) {
  // 只把「01.」「01_」「01)」这类前缀当序号，避免误删「1999 - 歌名」这种以数字开头的歌手名
  const withoutIndex = baseName.replace(/^\d{1,3}[._)]\s*/, '').trim();
  const sep = withoutIndex.indexOf(' - ');
  if (sep === -1) return { artist: '', title: withoutIndex || baseName };
  return {
    artist: withoutIndex.slice(0, sep).trim(),
    title: withoutIndex.slice(sep + 3).trim() || withoutIndex,
  };
}

/** 毫秒 → LRC 时间标签 [mm:ss.xx] */
function lrcStamp(ms) {
  const totalCs = Math.max(0, Math.round(ms / 10));
  return `[${pad(Math.floor(totalCs / 6000))}:${pad(Math.floor(totalCs / 100) % 60)}.${pad(totalCs % 100)}]`;
}

/**
 * 把内嵌歌词整理成 LRC 文本：
 * - 同步歌词（ID3 SYLT 等，带毫秒时间戳）→ 转成 LRC
 * - 文本歌词：本身是 LRC（很多软件把 LRC 原样写进 USLT / LYRICS 标签）就原样保留；纯文本也保留，网页上按静态歌词显示
 */
function embeddedLyricsToLrc(lyricsTags) {
  if (!Array.isArray(lyricsTags)) return '';
  for (const tag of lyricsTags) {
    const synced = Array.isArray(tag?.syncText) ? tag.syncText.filter((l) => typeof l?.timestamp === 'number' && l.text?.trim()) : [];
    if (synced.length > 0 && tag.timeStampFormat === TIMESTAMP_MILLISECONDS) {
      return synced.map((l) => `${lrcStamp(l.timestamp)}${l.text.trim()}`).join('\n');
    }
  }
  for (const tag of lyricsTags) {
    const text = typeof tag === 'string' ? tag : tag?.text;
    if (typeof text === 'string' && text.trim()) return text.replace(/\r\n?/g, '\n').trim();
  }
  return '';
}

/** 优先取「封面（正面）」，没有就取第一张 */
function pickCover(pictures) {
  if (!Array.isArray(pictures) || pictures.length === 0) return null;
  return pictures.find((p) => /cover \(front\)/i.test(p?.type ?? '')) ?? pictures[0];
}

/** music-metadata 没装时（例如还没执行 npm install）退回到只按文件名生成歌单 */
async function loadParser() {
  try {
    const mm = await import('music-metadata');
    return mm.parseFile;
  } catch {
    console.warn('⚠️  未安装 music-metadata，本次只按文件名生成歌单（执行 npm install 后可读取内嵌封面与歌词）');
    return null;
  }
}

async function readTags(parseFile, fullPath) {
  if (!parseFile) return null;
  try {
    const { common } = await parseFile(fullPath, { duration: false, skipCovers: false });
    return common;
  } catch (error) {
    console.warn(`⚠️  读取标签失败，按文件名处理：${path.basename(fullPath)}（${error instanceof Error ? error.message : error}）`);
    return null;
  }
}

/** 重新生成导出目录，避免删歌后残留旧文件 */
function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function scan() {
  if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true });
  resetDir(COVER_DIR);
  resetDir(LYRICS_DIR);

  const files = fs.readdirSync(MUSIC_DIR).filter((f) => !f.startsWith('.') && fs.statSync(path.join(MUSIC_DIR, f)).isFile());
  const byLowerName = new Map(files.map((f) => [f.toLowerCase(), f]));
  const findSibling = (base, exts) => {
    for (const ext of exts) {
      const hit = byLowerName.get((base + ext).toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };

  const parseFile = await loadParser();
  const audioFiles = files
    .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));

  const stats = { embeddedCovers: 0, embeddedLyrics: 0 };
  const tracks = [];

  for (const file of audioFiles) {
    const base = file.slice(0, -path.extname(file).length);
    const fromName = parseName(base);
    const tags = await readTags(parseFile, path.join(MUSIC_DIR, file));
    const id = shortHash(file);

    // 歌名 / 歌手：标签优先，标签为空时用文件名
    const tagArtist = tags?.artist?.trim() || (Array.isArray(tags?.artists) ? tags.artists.filter(Boolean).join(' / ') : '');
    const title = tags?.title?.trim() || fromName.title;
    const artist = tagArtist || fromName.artist;

    // 封面：同名图片 > 内嵌封面
    let cover;
    const coverFile = findSibling(base, COVER_EXT);
    if (coverFile) {
      cover = toUrl(coverFile);
    } else {
      const picture = pickCover(tags?.picture);
      const ext = picture ? MIME_EXT[picture.format?.toLowerCase()] : undefined;
      if (picture && ext && picture.data?.length) {
        fs.writeFileSync(path.join(COVER_DIR, id + ext), picture.data);
        cover = toUrl('_covers', id + ext);
        stats.embeddedCovers += 1;
      }
    }

    // 歌词：同名 .lrc > 内嵌歌词
    let lrcUrl;
    const lrcFile = findSibling(base, ['.lrc']);
    if (lrcFile) {
      lrcUrl = toUrl(lrcFile);
    } else {
      const lrc = embeddedLyricsToLrc(tags?.lyrics);
      if (lrc) {
        fs.writeFileSync(path.join(LYRICS_DIR, `${id}.lrc`), lrc + '\n', 'utf8');
        lrcUrl = toUrl('_lyrics', `${id}.lrc`);
        stats.embeddedLyrics += 1;
      }
    }

    tracks.push({
      id: `local:${file}`,
      title,
      artist,
      src: toUrl(file),
      ...(cover ? { cover } : {}),
      ...(lrcUrl ? { lrcUrl } : {}),
    });
  }

  return { tracks, stats };
}

const { tracks, stats } = await scan();
fs.writeFileSync(MANIFEST, JSON.stringify({ tracks }, null, 2) + '\n', 'utf8');
console.log(
  `🎵 本地歌单：${tracks.length} 首 → public/music/playlist.json` +
    (stats.embeddedCovers || stats.embeddedLyrics ? `（读取内嵌封面 ${stats.embeddedCovers} 张、歌词 ${stats.embeddedLyrics} 份）` : ''),
);
