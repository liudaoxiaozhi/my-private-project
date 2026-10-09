// app/api/admin/data/[name]/route.ts —— 照片墙 / 友链 / 项目：GET 整份读、PUT 整份写
import { adminRoute, fail, json, readJson } from '../../../../../lib/server/admin/api';
import { isDataName, readData, writeData } from '../../../../../lib/server/admin/settings';
import type { Attachment } from '../../../../../lib/server/admin/content';

type Ctx = { params: Promise<{ name: string }> };

export const GET = adminRoute(async (_req: Request, { params }: Ctx) => {
  const { name } = await params;
  if (!isDataName(name)) return fail('没有这份数据', 404);
  return json({ items: await readData(name) });
});

export const PUT = adminRoute(async (req: Request, { params }: Ctx) => {
  const { name } = await params;
  if (!isDataName(name)) return fail('没有这份数据', 404);
  const body = await readJson<{ items: unknown; attachments?: Attachment[] }>(req);
  return json({ ok: true, ...(await writeData(name, body.items, body.attachments)) });
});
