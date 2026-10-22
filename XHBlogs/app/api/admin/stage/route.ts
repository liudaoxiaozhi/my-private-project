// app/api/admin/stage/route.ts —— 暂存上传的文件（图片、音频、封面），返回 id，保存时随提交一起落盘
//
// POST { data: base64 } → { id }。Vercel 的请求体上限是 4.5MB，所以 GitHub 存储时这里只收 3MB 以内的文件，
// 更大的音频由浏览器直接传到 GitHub（GET 拿上传地址，见 lib/admin/client.ts 的 stage）。
// 本地存储（自己的服务器）没有这个限制：大文件直接 POST 原始字节（Content-Type: application/octet-stream），
// 上限是这里的 200MB 和 nginx 的 client_max_body_size（docs/DEPLOY-BAOTA.md 里设成 100m）。
import { adminRoute, fail, json, readJson } from '../../../../lib/server/admin/api';
import { getStorage, githubUploadTarget } from '../../../../lib/server/admin/storage';

const MAX_STAGE_BYTES = 3 * 1024 * 1024;
const MAX_LOCAL_STAGE_BYTES = 200 * 1024 * 1024;

export const GET = adminRoute(async () => json({ direct: githubUploadTarget() }));

export const POST = adminRoute(async (req: Request) => {
  const storage = getStorage();
  let buffer: Buffer;
  if ((req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/octet-stream')) {
    if (storage.kind !== 'local') return fail('只有本地存储能直接上传大文件', 400);
    if (Number(req.headers.get('content-length') ?? 0) > MAX_LOCAL_STAGE_BYTES) return fail('文件太大了（超过 200MB）', 413);
    buffer = Buffer.from(await req.arrayBuffer());
  } else {
    const { data } = await readJson<{ data?: unknown }>(req);
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return fail('文件内容不对', 400);
    buffer = Buffer.from(data, 'base64');
  }
  if (buffer.length === 0) return fail('文件是空的', 400);
  if (buffer.length > MAX_STAGE_BYTES && storage.kind === 'github') return fail('文件太大了（超过 3MB）', 413);
  if (buffer.length > MAX_LOCAL_STAGE_BYTES) return fail('文件太大了（超过 200MB）', 413);
  return json({ id: await storage.stage(buffer) });
});
