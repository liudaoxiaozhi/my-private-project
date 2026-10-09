// app/api/admin/content/[kind]/route.ts —— 文章 / 杂谈 / 说说 / 关于我：GET 列表、POST 保存（新建或修改）
import { adminRoute, fail, json, readJson } from '../../../../../lib/server/admin/api';
import { isContentKind, listContent, saveContent } from '../../../../../lib/server/admin/content';
import type { SaveInput } from '../../../../../lib/server/admin/content';

type Ctx = { params: Promise<{ kind: string }> };

export const GET = adminRoute(async (_req: Request, { params }: Ctx) => {
  const { kind } = await params;
  if (!isContentKind(kind)) return fail('没有这一类内容', 404);
  return json({ items: await listContent(kind) });
});

export const POST = adminRoute(async (req: Request, { params }: Ctx) => {
  const { kind } = await params;
  if (!isContentKind(kind)) return fail('没有这一类内容', 404);
  return json({ ok: true, ...(await saveContent(kind, await readJson<SaveInput>(req))) });
});
