// app/api/admin/content/[kind]/[slug]/route.ts —— 读取一篇（编辑用）、删除一篇
import { adminRoute, fail, json } from '../../../../../../lib/server/admin/api';
import { deleteContent, getContent, isContentKind } from '../../../../../../lib/server/admin/content';

type Ctx = { params: Promise<{ kind: string; slug: string }> };

export const GET = adminRoute(async (_req: Request, { params }: Ctx) => {
  const { kind, slug } = await params;
  if (!isContentKind(kind)) return fail('没有这一类内容', 404);
  const doc = await getContent(kind, decodeURIComponent(slug));
  return doc ? json(doc) : fail('找不到这篇', 404);
});

export const DELETE = adminRoute(async (_req: Request, { params }: Ctx) => {
  const { kind, slug } = await params;
  if (!isContentKind(kind)) return fail('没有这一类内容', 404);
  return json({ ok: true, ...(await deleteContent(kind, decodeURIComponent(slug))) });
});
