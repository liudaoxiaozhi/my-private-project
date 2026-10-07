// lib/friendLink.ts —— 友链申请模板的占位符替换（客户端使用）
//
// siteConfig.friendLinkApplyFormat 里可以写：
//   {{name}}     → siteConfig.title
//   {{bio}}      → siteConfig.bio
//   {{siteUrl}}  → 访客当前打开的网址（自动适配 Vercel 域名 / 自定义域名 / Docker）
//   {{avatar}}   → siteConfig.avatarUrl（站内相对路径会补全成完整网址）
// 改了名字、简介、头像或域名后，模板自动跟着变，不用再手动同步。
import { siteConfig } from '../siteConfig';

/** origin 为空（服务端渲染 / 首帧）时用占位文字，挂载后再填入真实网址 */
export function fillFriendLinkTemplate(template: string, origin: string): string {
  const avatar = siteConfig.avatarUrl.startsWith('/') && origin ? origin + siteConfig.avatarUrl : siteConfig.avatarUrl;
  const values: Record<string, string> = {
    name: siteConfig.title,
    bio: siteConfig.bio,
    siteUrl: origin || '（本站网址）',
    avatar,
  };
  return template.replace(/\{\{(name|bio|siteUrl|avatar)\}\}/g, (_, key: string) => values[key] ?? '');
}
