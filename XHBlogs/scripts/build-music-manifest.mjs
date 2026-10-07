#!/usr/bin/env node
// scripts/build-music-manifest.mjs —— 扫描 public/music/，生成本地歌单 public/music/playlist.json
//
// 在 `npm run dev` / `npm run build` 前自动执行（见 package.json），无需任何配置：
//   public/music/
//   ├── 01. YOASOBI - 夜に駆ける.mp3   ← 文件名：可选序号 + 「歌手 - 歌名」
//   ├── 01. YOASOBI - 夜に駆ける.lrc   ← 可选：同名歌词
//   └── 01. YOASOBI - 夜に駆ける.jpg   ← 可选：同名封面（jpg / jpeg / png / webp）
//
// 只依赖 Node 内置模块，Vercel、Docker、本地开发都能直接运行。
import fs from 'node:fs';
import path from 'node:path';

const MUSIC_DIR = path.join(process.cwd(), 'public', 'music');
const MANIFEST = path.join(MUSIC_DIR, 'playlist.json');
const PUBLIC_PREFIX = '/music/';

/** 浏览器普遍支持的音频格式（ogg/opus 在旧版 Safari 上不可用，flac/wav 体积较大，不建议） */
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wav']);
const COVER_EXT = ['.webp', '.jpg', '.jpeg', '.png'];

/** 每个路径段单独编码，保证中文、日文、空格、# 等字符在 URL 中安全 */
const toUrl = (fileName) => PUBLIC_PREFIX + encodeURIComponent(fileName);

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

function scan() {
  if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true });

  const files = fs.readdirSync(MUSIC_DIR).filter((f) => !f.startsWith('.'));
  const byLowerName = new Map(files.map((f) => [f.toLowerCase(), f]));
  const findSibling = (base, exts) => {
    for (const ext of exts) {
      const hit = byLowerName.get((base + ext).toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };

  return files
    .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
    .map((file) => {
      const base = file.slice(0, -path.extname(file).length);
      const { artist, title } = parseName(base);
      const lrc = findSibling(base, ['.lrc']);
      const cover = findSibling(base, COVER_EXT);
      return {
        id: `local:${file}`,
        title,
        artist,
        src: toUrl(file),
        ...(cover ? { cover: toUrl(cover) } : {}),
        ...(lrc ? { lrcUrl: toUrl(lrc) } : {}),
      };
    });
}

const tracks = scan();
fs.writeFileSync(MANIFEST, JSON.stringify({ tracks }, null, 2) + '\n', 'utf8');
console.log(`🎵 本地歌单：${tracks.length} 首 → public/music/playlist.json`);
