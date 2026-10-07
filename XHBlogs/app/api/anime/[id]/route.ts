// app/api/anime/[id]/route.ts —— 修改 / 删除追番条目（仅本地开发模式）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deleteAnime, updateAnime } from '../../../../lib/server/animeStore';
import { errorResponse, readJson, rejectUnlessLocalEdit } from '../guard';

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/anime/[id]'>) {
  const rejected = rejectUnlessLocalEdit(req);
  if (rejected) return rejected;
  try {
    const { id } = await ctx.params;
    const entry = await updateAnime(id, await readJson(req));
    return NextResponse.json({ entry });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/anime/[id]'>) {
  const rejected = rejectUnlessLocalEdit(req);
  if (rejected) return rejected;
  try {
    const { id } = await ctx.params;
    await deleteAnime(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
