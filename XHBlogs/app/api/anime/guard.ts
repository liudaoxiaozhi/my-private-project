// app/api/anime/guard.ts —— 追番接口共用的校验：本地开发服务器，或者登录了网页后台；且只接受本站页面发起的请求
import { NextResponse } from 'next/server';
import { isSameOrigin } from '../../../lib/server/requestGuard';
import { ANIME_EDITABLE, AnimeError } from '../../../lib/server/animeStore';
import { isAdminConfigured, isLoggedIn } from '../../../lib/server/admin/auth';

/** 能不能编辑追番：本地开发模式谁都能改，线上要登录网页后台 */
export async function canEditAnime(): Promise<boolean> {
  return ANIME_EDITABLE || (isAdminConfigured() && (await isLoggedIn()));
}

/** 不允许时返回错误响应，允许时返回 null */
export async function rejectUnlessEditor(req: Request, checkOrigin = true): Promise<NextResponse | null> {
  if (!(await canEditAnime())) {
    return NextResponse.json({ error: '要先登录网页后台（/admin）才能编辑追番' }, { status: 403 });
  }
  if (checkOrigin && !isSameOrigin(req)) {
    return NextResponse.json({ error: '请求来源不受信任' }, { status: 403 });
  }
  return null;
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AnimeError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('追番接口出错:', error);
  return NextResponse.json({ error: error instanceof Error && error.message ? error.message : '保存失败，请查看服务器日志' }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AnimeError('请求内容不是合法的 JSON', 400);
  }
}
