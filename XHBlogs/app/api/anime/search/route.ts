// app/api/anime/search/route.ts —— 代理 Bangumi（动画）/ TMDB（电影、电视剧）搜索，给「添加追番」自动填写信息用（仅本地开发模式）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseBangumiId } from '../../../../lib/anime';
import { ANIME_EDITABLE, AnimeError, searchBangumi } from '../../../../lib/server/animeStore';
import { searchTmdb } from '../../../../lib/server/tmdb';

export async function GET(req: NextRequest) {
  if (!ANIME_EDITABLE) {
    return NextResponse.json({ error: '只在本地开发模式下可用' }, { status: 403 });
  }
  const params = req.nextUrl.searchParams;
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  const source = params.get('source') === 'tmdb' ? 'tmdb' : 'bangumi';
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = source === 'tmdb' ? await searchTmdb(q) : await searchBangumi(q, parseBangumiId(q));
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof AnimeError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(`${source} 搜索失败:`, error);
    return NextResponse.json({ error: `连不上 ${source === 'tmdb' ? 'TMDB' : 'Bangumi'}，可以稍后再试，或者手动填写` }, { status: 502 });
  }
}
