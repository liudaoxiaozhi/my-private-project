// app/api/anime/tmdb-key/route.ts —— 在追番页里填写 TMDB Key：先验证，再写进 .env.local（仅本地开发模式）
import { NextResponse } from 'next/server';
import { AnimeError } from '../../../../lib/server/animeStore';
import { setEnvValue } from '../../../../lib/server/envFile';
import { TMDB_KEY_PATTERN, verifyTmdbKey } from '../../../../lib/server/tmdb';
import { errorResponse, readJson, rejectUnlessLocalEdit } from '../guard';

export async function PUT(req: Request) {
  const rejected = rejectUnlessLocalEdit(req);
  if (rejected) return rejected;
  try {
    const body = (await readJson(req)) as { key?: unknown };
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!TMDB_KEY_PATTERN.test(key)) throw new AnimeError('格式不对：粘贴 TMDB 的 API Key（32 位）或 Read Access Token', 400);
    await verifyTmdbKey(key);
    setEnvValue('TMDB_API_KEY', key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
