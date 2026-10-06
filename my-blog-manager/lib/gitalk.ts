// lib/gitalk.ts —— 三个评论组件共用的 Gitalk 基础配置
import { siteConfig } from '../siteConfig';

/**
 * 前端不再持有真实的 Client Secret。
 * Gitalk 构造时仍会读取 clientSecret 字段，这里传占位符；
 * 真正的 secret 由 /api/github 从环境变量 GITALK_CLIENT_SECRET 注入。
 */
const CLIENT_SECRET_PLACEHOLDER = 'injected-by-server';

/** Gitalk 要求 Issue Label（即 id）不超过 50 个字符 */
const MAX_ID_LENGTH = 49;

export interface GitalkBaseOptions {
  clientID: string;
  clientSecret: string;
  repo: string;
  owner: string;
  admin: string[];
  proxy: string;
  distractionFreeMode: boolean;
}

export function getGitalkBaseOptions(): GitalkBaseOptions {
  const { clientID, repo, owner, admin } = siteConfig.gitalkConfig;
  return {
    clientID,
    clientSecret: CLIENT_SECRET_PLACEHOLDER,
    repo,
    owner,
    admin,
    // 统一走同源代理：密钥只在服务端出现，也不依赖第三方 CORS 代理
    proxy: '/api/github',
    distractionFreeMode: false,
  };
}

export function toGitalkId(raw: string): string {
  return raw.substring(0, MAX_ID_LENGTH);
}
