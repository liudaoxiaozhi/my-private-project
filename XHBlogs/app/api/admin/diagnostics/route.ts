// app/api/admin/diagnostics/route.ts —— 后台「接口自检」：从服务器去连书影音和音乐用到的外部接口，看能不能用
//
// 每项最多等 10 秒、并行跑；返回 ok（true 成功 / false 失败 / null 没配置、跳过）、耗时和一句说明，后台照原样显示。
// ?song=网易云歌曲 ID 可以换一首测（默认《晴天》）
import { adminRoute, json } from '../../../../lib/server/admin/api';
import { BANGUMI_TYPES, searchBangumi } from '../../../../lib/server/animeStore';
import { searchOpenLibrary } from '../../../../lib/server/openLibrary';
import { searchTmdb, tmdbConfigured } from '../../../../lib/server/tmdb';
import { lyric, songDetails } from '../../../../lib/server/netease';

const TIMEOUT_MS = 10_000;
const DEFAULT_SONG = 186016;

export interface DiagnosticResult {
  id: string;
  label: string;
  ok: boolean | null;
  ms: number;
  detail: string;
}

class Skip extends Error {}

async function check(id: string, label: string, run: () => Promise<string>): Promise<DiagnosticResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`超过 ${TIMEOUT_MS / 1000} 秒没有响应`)), TIMEOUT_MS);
    });
    const detail = await Promise.race([run(), timeout]);
    return { id, label, ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { id, label, ok: error instanceof Skip ? null : false, ms: Date.now() - started, detail: message || '未知错误' };
  } finally {
    clearTimeout(timer);
  }
}

const found = (n: number) => (n > 0 ? `能连上，搜到 ${n} 条` : '能连上，但没有搜到结果');

export const GET = adminRoute(async (req: Request) => {
  const songParam = Number(new URL(req.url).searchParams.get('song'));
  const songId = Number.isInteger(songParam) && songParam > 0 ? songParam : DEFAULT_SONG;

  const results = await Promise.all([
    check('bangumi-book', 'Bangumi · 书籍搜索', async () => found((await searchBangumi('三体', null, BANGUMI_TYPES.book)).length)),
    check('bangumi-music', 'Bangumi · 音乐搜索', async () => found((await searchBangumi('Lemon', null, BANGUMI_TYPES.music)).length)),
    check('openlibrary', 'Open Library · 书籍搜索', async () => found((await searchOpenLibrary('The Three-Body Problem')).length)),
    check('tmdb', 'TMDB · 电影 / 电视剧搜索', async () => {
      if (!(await tmdbConfigured())) throw new Skip('没有配置 TMDB Key，跳过');
      return found((await searchTmdb('Breaking Bad')).length);
    }),
    check('netease-song', '网易云 · 歌曲信息', async () => {
      const [song] = await songDetails([songId]);
      if (!song) throw new Error(`查不到歌曲 ${songId}`);
      return `能连上：${song.title} - ${song.artist}`;
    }),
    check('netease-lyric', '网易云 · 逐字歌词', async () => {
      const { lrc, yrc, translation } = await lyric(songId);
      if (yrc) return `有逐字歌词${translation ? '和翻译' : ''}`;
      if (lrc) throw new Error('只拿到普通歌词：逐字歌词接口不可用（页面会按整行时长估算，照样逐字点亮）');
      return '这首歌没有歌词（纯音乐）';
    }),
  ]);
  return json({ results, checkedAt: new Date().toISOString() });
});
