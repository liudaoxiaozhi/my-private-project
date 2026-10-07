// app/api/anime/route.ts —— 新增追番条目（仅本地开发模式）
import { NextResponse } from 'next/server';
import { createAnime } from '../../../lib/server/animeStore';
import { errorResponse, readJson, rejectUnlessLocalEdit } from './guard';

export async function POST(req: Request) {
  const rejected = rejectUnlessLocalEdit(req);
  if (rejected) return rejected;
  try {
    const entry = await createAnime(await readJson(req));
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
