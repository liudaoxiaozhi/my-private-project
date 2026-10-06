// app/api/github/route.ts —— Gitalk 的 GitHub OAuth 换取 access_token 代理
//
// 安全模型：Client Secret 只存在于服务端环境变量 GITALK_CLIENT_SECRET，
// 前端 Gitalk 只把一次性的 OAuth code 发过来，由这里补上 secret 再向 GitHub 换 token。
import { siteConfig } from '../../../siteConfig';
import { getClientIp, isSameOrigin, jsonResponse, rateLimit } from '../../../lib/server/requestGuard';

const RATE_LIMIT = { bucket: 'github-oauth', limit: 20, windowMs: 60_000 } as const;
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
/** GitHub OAuth code 是 20 位十六进制，这里放宽一些做格式兜底 */
const OAUTH_CODE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

interface OAuthExchangeBody {
  code?: unknown;
  client_id?: unknown;
}

/** Gitalk 默认发 JSON，这里同时兼容 form 表单格式 */
async function readBody(req: Request): Promise<OAuthExchangeBody> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = new URLSearchParams(await req.text());
    return {
      code: form.get('code') ?? undefined,
      client_id: form.get('client_id') ?? undefined,
    };
  }
  return (await req.json()) as OAuthExchangeBody;
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const limited = rateLimit(getClientIp(req), RATE_LIMIT);
  if (!limited.ok) {
    return jsonResponse({ error: 'too_many_requests' }, 429, { 'Retry-After': String(limited.retryAfterSec) });
  }

  let body: OAuthExchangeBody;
  try {
    body = await readBody(req);
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!OAUTH_CODE_PATTERN.test(code)) {
    return jsonResponse({ error: 'invalid_code' }, 400);
  }

  // 只为本站自己的 OAuth App 换 token，防止接口被当成公共代理
  const clientId = (process.env.GITALK_CLIENT_ID || siteConfig.gitalkConfig.clientID || '').trim();
  if (!clientId || body.client_id !== clientId) {
    return jsonResponse({ error: 'invalid_client' }, 400);
  }

  // 前端传来的 client_secret 一律忽略（前端只会带占位符）。
  // 优先读环境变量；本地后台（my-blog-manager）没有环境变量时，回退读取本地 siteConfig。
  // 前台 siteConfig 里的 clientSecret 会在「同步 Blog」时被清空，因此线上只会走环境变量。
  const envSecret = (process.env.GITALK_CLIENT_SECRET || '').trim();
  const clientSecret = envSecret || (siteConfig.gitalkConfig.clientSecret || '').trim();
  if (!clientSecret) {
    console.error('[api/github] 未配置环境变量 GITALK_CLIENT_SECRET，评论登录不可用');
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }
  if (!envSecret && process.env.NODE_ENV === 'production') {
    console.warn('[api/github] ⚠️ 正在使用 siteConfig 中的 clientSecret，它会被打包进前端 JS，请改用环境变量 GITALK_CLIENT_SECRET');
  }

  try {
    const githubRes = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      signal: AbortSignal.timeout(10_000),
    });

    // GitHub 成功与失败都返回 JSON（access_token 或 error 字段），原样交还给 Gitalk
    const data: unknown = await githubRes.json();
    return jsonResponse(data, githubRes.ok ? 200 : 502);
  } catch (error: unknown) {
    console.error('[api/github] 换取 token 失败:', error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: 'upstream_error' }, 502);
  }
}
