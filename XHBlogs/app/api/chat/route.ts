// app/api/chat/route.ts —— 右下角桌宠的 Gemini 对话代理（人设见 siteConfig.geminiConfig.systemPrompt）
import { siteConfig } from '../../../siteConfig';
import { getClientIp, isSameOrigin, jsonResponse, rateLimit } from '../../../lib/server/requestGuard';
import { getSecret } from '../../../lib/server/admin/secrets';

/** 单条消息最大字符数（桌宠只回一两句话，输入也没必要太长） */
const MAX_MESSAGE_LENGTH = 300;
/** 每个 IP 每分钟最多对话次数 */
const RATE_LIMIT = { bucket: 'chat', limit: 8, windowMs: 60_000 } as const;
/** 上游超时 */
const UPSTREAM_TIMEOUT_MS = 15_000;

interface ChatRequestBody {
  message?: unknown;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

const FALLBACK_REPLY = '……（她好像在走神）';

export async function POST(req: Request): Promise<Response> {
  // 1. 只接受本站页面发起的请求
  if (!isSameOrigin(req)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  // 2. 按 IP 限流
  const limited = rateLimit(getClientIp(req), RATE_LIMIT);
  if (!limited.ok) {
    return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': String(limited.retryAfterSec) });
  }

  // 3. 校验输入
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` }, 400);
  }

  // 4. 读取密钥：环境变量，或网页后台「书影音与密钥」里加密保存的（绝不写进 siteConfig）
  const apiKey = (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '').trim() || (await getSecret('GEMINI_API_KEY'));
  if (!apiKey) {
    console.error('[api/chat] 未配置 GEMINI_API_KEY');
    return jsonResponse({ error: 'Service unavailable' }, 503);
  }

  const { modelId, systemPrompt, maxOutputTokens, temperature } = siteConfig.geminiConfig;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 密钥放在请求头而不是 URL 查询参数，避免出现在日志与报错信息里
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens, temperature },
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const data = (await upstream.json()) as GeminiResponse;

    if (!upstream.ok) {
      // 详细错误只写服务端日志，不回传给浏览器
      console.error(`[api/chat] Gemini 返回 ${upstream.status}:`, data.error?.message ?? 'unknown');
      return jsonResponse({ error: 'Upstream error' }, 502);
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || FALLBACK_REPLY;
    return jsonResponse({ reply });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('[api/chat] 请求失败:', reason);
    return jsonResponse({ error: 'Upstream error' }, 502);
  }
}

export async function GET(): Promise<Response> {
  return jsonResponse({ status: 'Ready', model: siteConfig.geminiConfig.modelId });
}
