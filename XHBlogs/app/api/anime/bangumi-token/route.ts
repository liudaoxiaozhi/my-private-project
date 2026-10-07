// app/api/anime/bangumi-token/route.ts —— 在追番页里登录 Bangumi：验证 Access Token 后写进 .env.local（仅本地开发模式）
import { NextResponse } from 'next/server';
import { AnimeError, verifyBangumiToken } from '../../../../lib/server/animeStore';
import { SECRET_PATTERN, setEnvValue } from '../../../../lib/server/envFile';
import { errorResponse, readJson, rejectUnlessLocalEdit } from '../guard';

export async function PUT(req: Request) {
  const rejected = rejectUnlessLocalEdit(req);
  if (rejected) return rejected;
  try {
    const body = (await readJson(req)) as { key?: unknown };
    const token = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!SECRET_PATTERN.test(token)) throw new AnimeError('格式不对：粘贴在 Bangumi 生成的 Access Token', 400);
    const nickname = await verifyBangumiToken(token);
    setEnvValue('BANGUMI_ACCESS_TOKEN', token);
    return NextResponse.json({ ok: true, nickname });
  } catch (error) {
    return errorResponse(error);
  }
}
