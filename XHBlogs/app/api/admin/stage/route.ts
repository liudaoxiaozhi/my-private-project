// app/api/admin/stage/route.ts —— 暂存上传的文件（图片、音频、封面），返回 id，保存时随提交一起落盘
//
// POST { data: base64 } → { id }。Vercel 的请求体上限是 4.5MB，所以这里只收 3MB 以内的文件；
// 更大的音频由浏览器直接传到 GitHub（GET 拿上传地址，见 lib/admin/upload.ts）。
import { adminRoute, fail, json, readJson } from '../../../../lib/server/admin/api';
import { getStorage, githubUploadTarget } from '../../../../lib/server/admin/storage';

const MAX_STAGE_BYTES = 3 * 1024 * 1024;

export const GET = adminRoute(async () => json({ direct: githubUploadTarget() }));

export const POST = adminRoute(async (req: Request) => {
  const { data } = await readJson<{ data?: unknown }>(req);
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return fail('文件内容不对', 400);
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length === 0) return fail('文件是空的', 400);
  if (buffer.length > MAX_STAGE_BYTES && getStorage().kind === 'github') return fail('文件太大了（超过 3MB）', 413);
  return json({ id: await getStorage().stage(buffer) });
});
