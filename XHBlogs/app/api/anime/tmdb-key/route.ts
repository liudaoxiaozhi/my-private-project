// app/api/anime/tmdb-key/route.ts —— 在书影音页里填写 TMDB Key：先验证，再保存（本地写进 .env.local，线上加密存进仓库，见 lib/server/admin/secrets.ts）
import { NextResponse } from 'next/server';
import { AnimeError } from '../../../../lib/server/animeStore';
import { SECRET_PATTERN } from '../../../../lib/server/envFile';
import { setSecret } from '../../../../lib/server/admin/secrets';
import { verifyTmdbKey } from '../../../../lib/server/tmdb';
import { errorResponse, readJson, rejectUnlessEditor } from '../guard';

export async function PUT(req: Request) {
  const rejected = await rejectUnlessEditor(req);
  if (rejected) return rejected;
  try {
    const body = (await readJson(req)) as { key?: unknown };
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!SECRET_PATTERN.test(key)) throw new AnimeError('格式不对：粘贴 TMDB 的 API Key（32 位）或 Read Access Token', 400);
    await verifyTmdbKey(key);
    await setSecret('TMDB_API_KEY', key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
