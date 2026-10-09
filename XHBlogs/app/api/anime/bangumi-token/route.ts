// app/api/anime/bangumi-token/route.ts —— 在追番页里登录 Bangumi：验证 Access Token 后保存（本地写进 .env.local，线上加密存进仓库）
import { NextResponse } from 'next/server';
import { AnimeError, verifyBangumiToken } from '../../../../lib/server/animeStore';
import { SECRET_PATTERN } from '../../../../lib/server/envFile';
import { setSecret } from '../../../../lib/server/admin/secrets';
import { errorResponse, readJson, rejectUnlessEditor } from '../guard';

export async function PUT(req: Request) {
  const rejected = await rejectUnlessEditor(req);
  if (rejected) return rejected;
  try {
    const body = (await readJson(req)) as { key?: unknown };
    const token = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!SECRET_PATTERN.test(token)) throw new AnimeError('格式不对：粘贴在 Bangumi 生成的 Access Token', 400);
    const nickname = await verifyBangumiToken(token);
    await setSecret('BANGUMI_ACCESS_TOKEN', token);
    return NextResponse.json({ ok: true, nickname });
  } catch (error) {
    return errorResponse(error);
  }
}
