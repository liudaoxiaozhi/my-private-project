// app/api/admin/deploy/route.ts —— 某次提交的部署状态（保存后轮询，告诉用户网站什么时候更新好）
import { adminRoute, fail, json } from '../../../../lib/server/admin/api';
import { getStorage } from '../../../../lib/server/admin/storage';

export const GET = adminRoute(async (req: Request) => {
  const sha = new URL(req.url).searchParams.get('sha') ?? '';
  if (!/^[0-9a-f]{40}$/.test(sha)) return fail('sha 不对', 400);
  return json(await getStorage().deployStatus(sha));
});
