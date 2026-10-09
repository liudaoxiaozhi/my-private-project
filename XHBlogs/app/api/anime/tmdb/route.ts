// app/api/anime/tmdb/route.ts —— 取 TMDB 详情（电视剧的季与集数、电影所属系列、系列里的每一部），整理成表单草稿（本地开发模式，或登录了网页后台）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { TmdbType } from '../../../../lib/anime';
import { getTmdbDetail } from '../../../../lib/server/tmdb';
import { errorResponse, rejectUnlessEditor } from '../guard';

const TYPES: readonly TmdbType[] = ['movie', 'tv', 'collection'];

export async function GET(req: NextRequest) {
  const rejected = await rejectUnlessEditor(req, false);
  if (rejected) return rejected;
  const params = req.nextUrl.searchParams;
  const type = TYPES.find((t) => t === params.get('type'));
  const id = Number(params.get('id'));
  if (!type || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '参数不对：需要 type=movie|tv|collection 和 id' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getTmdbDetail(type, id));
  } catch (error) {
    return errorResponse(error);
  }
}
