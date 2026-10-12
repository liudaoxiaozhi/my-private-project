// app/api/anime/editor/route.ts —— 书影音页、想看清单打开时问一下：能不能编辑（本地开发 / 登录了网页后台），TMDB、Bangumi 的密钥配好没有
import { NextResponse } from 'next/server';
import { bangumiConfigured } from '../../../../lib/server/animeStore';
import { tmdbConfigured } from '../../../../lib/server/tmdb';
import { canEditAnime } from '../guard';

export async function GET() {
  if (!(await canEditAnime())) return NextResponse.json({ editable: false }, { headers: { 'Cache-Control': 'no-store' } });
  const [tmdb, bangumi] = await Promise.all([tmdbConfigured().catch(() => false), bangumiConfigured().catch(() => false)]);
  return NextResponse.json({ editable: true, credentials: { tmdb, bangumi } }, { headers: { 'Cache-Control': 'no-store' } });
}
