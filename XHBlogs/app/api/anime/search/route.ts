// app/api/anime/search/route.ts —— 代理 Bangumi 搜索，给「添加追番」自动填写信息用（仅本地开发模式）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseBangumiId } from '../../../../lib/anime';
import { ANIME_EDITABLE, searchBangumi } from '../../../../lib/server/animeStore';

export async function GET(req: NextRequest) {
  if (!ANIME_EDITABLE) {
    return NextResponse.json({ error: '只在本地开发模式下可用' }, { status: 403 });
  }
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await searchBangumi(q, parseBangumiId(q));
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Bangumi 搜索失败:', error);
    return NextResponse.json({ error: '连不上 Bangumi，可以稍后再试，或者手动填写' }, { status: 502 });
  }
}
