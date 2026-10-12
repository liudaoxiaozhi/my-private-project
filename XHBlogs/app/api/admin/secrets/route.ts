// app/api/admin/secrets/route.ts —— 后台「书影音与密钥」：GET 每个密钥的状态（不返回内容），PUT 保存 / 删除一个密钥
//
// TMDB Key、Bangumi 令牌保存前先验证一下能用；Gemini Key 直接保存。
import { adminRoute, AdminInputError, json, readJson } from '../../../../lib/server/admin/api';
import { isSecretName, secretStatus, setSecret } from '../../../../lib/server/admin/secrets';
import { SECRET_PATTERN } from '../../../../lib/server/envFile';
import { verifyTmdbKey } from '../../../../lib/server/tmdb';
import { AnimeError, verifyBangumiToken } from '../../../../lib/server/animeStore';

export const GET = adminRoute(async () => json({ status: await secretStatus() }));

export const PUT = adminRoute(async (req: Request) => {
  const { name, value } = await readJson<{ name?: unknown; value?: unknown }>(req);
  if (typeof name !== 'string' || !isSecretName(name)) throw new AdminInputError('不认识这个密钥');
  const v = typeof value === 'string' ? value.trim() : '';
  if (v && !SECRET_PATTERN.test(v)) throw new AdminInputError('格式不对：只能是字母、数字和 . _ -，至少 16 位');
  try {
    if (v && name === 'TMDB_API_KEY') await verifyTmdbKey(v);
    if (v && name === 'BANGUMI_ACCESS_TOKEN') await verifyBangumiToken(v);
  } catch (error) {
    if (error instanceof AnimeError) throw new AdminInputError(error.message);
    throw error;
  }
  const { sha } = await setSecret(name, v);
  return json({ ok: true, sha, status: await secretStatus() });
});
