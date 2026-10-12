// app/api/anime/search/route.ts —— 代理 Bangumi（动画 / 书籍 / 音乐 / 三次元）/ TMDB（电影、电视剧）/ Open Library（书）搜索，
// 给书影音页「添加」自动填写信息用（本地开发模式，或登录了网页后台）
//
// GET ?source=bangumi|tmdb|openlibrary&section=video|book|music&q=…
// section 只影响 Bangumi 搜哪些条目类型（影视：动画 + 三次元；书：书籍；音乐：音乐），默认 video
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseBangumiId, type MediaSection, type SearchSource } from '../../../../lib/anime';
import { AnimeError, BANGUMI_TYPES, searchBangumi } from '../../../../lib/server/animeStore';
import { rejectUnlessEditor } from '../guard';
import { searchTmdb } from '../../../../lib/server/tmdb';
import { searchOpenLibrary } from '../../../../lib/server/openLibrary';

const SOURCES: readonly SearchSource[] = ['bangumi', 'tmdb', 'openlibrary'];
const SECTIONS: readonly MediaSection[] = ['video', 'book', 'music'];
const SOURCE_NAME: Record<SearchSource, string> = { bangumi: 'Bangumi', tmdb: 'TMDB', openlibrary: 'Open Library' };

export async function GET(req: NextRequest) {
  const rejected = await rejectUnlessEditor(req, false);
  if (rejected) return rejected;
  const params = req.nextUrl.searchParams;
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const source = SOURCES.find((s) => s === params.get('source')) ?? 'bangumi';
  const section = SECTIONS.find((s) => s === params.get('section')) ?? 'video';
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results =
      source === 'tmdb'
        ? await searchTmdb(q)
        : source === 'openlibrary'
          ? await searchOpenLibrary(q)
          : await searchBangumi(q, parseBangumiId(q), BANGUMI_TYPES[section]);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof AnimeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(`${source} 搜索失败:`, error);
    return NextResponse.json({ error: `连不上 ${SOURCE_NAME[source]}，可以稍后再试，或者手动填写` }, { status: 502 });
  }
}
