// app/api/admin/rebuild/route.ts —— 自己的服务器上的「重新构建网站」：GET 查状态，POST 立即重建（见 lib/server/admin/rebuild.ts）
import { adminRoute, fail, json } from '../../../../lib/server/admin/api';
import { getRebuildInfo, requestRebuild } from '../../../../lib/server/admin/rebuild';
import { storageInfo } from '../../../../lib/server/admin/storage';

export const GET = adminRoute(async () => json(getRebuildInfo(storageInfo().rebuild === true)));

export const POST = adminRoute(async () => {
  if (storageInfo().rebuild !== true) return fail('没有开启自动重建：需要 ADMIN_STORAGE=local 和 SELF_HOST_REBUILD=1（见 docs/DEPLOY-BAOTA.md）', 400);
  requestRebuild('手动重建', { immediate: true });
  return json(getRebuildInfo(true));
});
