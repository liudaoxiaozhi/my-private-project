// app/api/anime/guard.ts —— 追番接口共用的校验：只在本地开发服务器、且只接受本站页面发起的请求
import { NextResponse } from 'next/server';
import { isSameOrigin } from '../../../lib/server/requestGuard';
import { ANIME_EDITABLE, AnimeError } from '../../../lib/server/animeStore';

/** 不允许时返回错误响应，允许时返回 null */
export function rejectUnlessLocalEdit(req: Request): NextResponse | null {
  if (!ANIME_EDITABLE) {
    return NextResponse.json({ error: '追番只能在本地开发模式（npm run dev）下编辑' }, { status: 403 });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: '请求来源不受信任' }, { status: 403 });
  }
  return null;
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AnimeError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('追番接口出错:', error);
  return NextResponse.json({ error: '保存失败，请查看终端里的报错' }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AnimeError('请求内容不是合法的 JSON', 400);
  }
}
