// lib/server/outboundFetch.ts —— 追番访问外网（TMDB / Bangumi / 封面）用的 fetch：配置了代理就走代理（仅服务端）
//
// Node 自带的 fetch 不会走系统代理（Clash、v2rayN 等），所以浏览器能打开 TMDB，本地服务器却可能连不上。
// 在 .env.local 里加一行 HTTPS_PROXY=http://127.0.0.1:7890（端口换成代理软件的 HTTP 端口）即可。
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const proxyUrl = (): string =>
  (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '').trim();

export const isProxyConfigured = (): boolean => proxyUrl() !== '';

/** 本机地址（如自建的反代）直连，不绕代理 */
const isLocalHost = (host: string): boolean => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

let agent: { uri: string; dispatcher: ProxyAgent } | null = null;

function proxyAgent(uri: string): ProxyAgent {
  if (agent?.uri !== uri) {
    void agent?.dispatcher.close();
    agent = { uri, dispatcher: new ProxyAgent(uri) };
  }
  return agent.dispatcher;
}

interface OutboundInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export function outboundFetch(input: string | URL, init: OutboundInit = {}): Promise<Response> {
  const url = new URL(input);
  const proxy = proxyUrl();
  if (!proxy || isLocalHost(url.hostname)) return fetch(url, { ...init, cache: 'no-store' });
  let dispatcher: ProxyAgent;
  try {
    dispatcher = proxyAgent(proxy);
  } catch {
    throw new Error(`代理地址格式不对：${proxy}（应类似 http://127.0.0.1:7890）`);
  }
  // undici 的 Response 与全局 Response 接口一致
  return undiciFetch(url, { ...init, dispatcher }) as unknown as Promise<Response>;
}
