// app/api/admin/config/route.ts —— 站点设置 / 外观 / 弹幕：GET 读取（默认值 + 修改），PUT 保存修改（值为 null 恢复默认）
import { adminRoute, json, readJson } from '../../../../lib/server/admin/api';
import { readConfig, saveConfig } from '../../../../lib/server/admin/settings';
import type { Attachment } from '../../../../lib/server/admin/content';

export const GET = adminRoute(async () => json(await readConfig()));

export const PUT = adminRoute(async (req: Request) => {
  const body = await readJson<{ patch: unknown; attachments?: Attachment[] }>(req);
  return json({ ok: true, ...(await saveConfig(body.patch, body.attachments)) });
});
