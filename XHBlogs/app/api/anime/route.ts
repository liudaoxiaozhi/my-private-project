// app/api/anime/route.ts —— 新增书影音条目（本地开发模式，或登录了网页后台）
import { NextResponse } from 'next/server';
import { createAnime } from '../../../lib/server/animeStore';
import { errorResponse, readJson, rejectUnlessEditor } from './guard';

export async function POST(req: Request) {
  const rejected = await rejectUnlessEditor(req);
  if (rejected) return rejected;
  try {
    const entry = await createAnime(await readJson(req));
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
