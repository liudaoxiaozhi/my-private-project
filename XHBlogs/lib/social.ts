// lib/social.ts —— 社交账号配置解析（客户端 / 服务端通用，无运行时依赖）
//
// siteConfig.social 里可以填用户名，也可以填完整链接：
//   github: "your-name"            或 "https://github.com/your-name"
//   instagram: "@your_name"        或 "https://www.instagram.com/your_name/"
//   email: "you@gmail.com"         （Gmail 地址显示 Gmail 图标，其他地址显示普通信封）
// 留空的平台不显示。

export type SocialKey = 'github' | 'email' | 'instagram' | 'gitee' | 'google' | 'qq' | 'wechat';

export type SocialIconName = 'github' | 'gmail' | 'email' | 'instagram' | 'gitee' | 'google' | 'qq' | 'wechat';

/** 显示顺序 */
export const SOCIAL_ORDER: readonly SocialKey[] = ['github', 'email', 'instagram', 'gitee', 'google', 'qq', 'wechat'];

export interface SocialEntry {
  key: SocialKey;
  icon: SocialIconName;
  /** 用于 aria-label / 悬停提示 */
  label: string;
  /** 原始配置值（复制时使用） */
  value: string;
  /** 有链接的平台在新标签页打开；没有则点击复制 value */
  href?: string;
}

const isUrl = (v: string): boolean => /^https?:\/\//i.test(v);
const handleOf = (v: string): string => v.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
const profileUrl = (v: string, base: string): string => (isUrl(v) ? v : `${base}${encodeURIComponent(handleOf(v))}`);

function resolveOne(key: SocialKey, value: string): SocialEntry {
  switch (key) {
    case 'github':
      return { key, icon: 'github', label: 'GitHub', value, href: profileUrl(value, 'https://github.com/') };
    case 'instagram':
      return { key, icon: 'instagram', label: 'Instagram', value, href: profileUrl(value, 'https://www.instagram.com/') };
    case 'gitee':
      return { key, icon: 'gitee', label: 'Gitee', value, href: profileUrl(value, 'https://gitee.com/') };
    case 'email': {
      const isGmail = /@(gmail|googlemail)\.com$/i.test(value);
      return { key, icon: isGmail ? 'gmail' : 'email', label: isGmail ? 'Gmail' : '邮箱', value };
    }
    case 'google':
      // 后台的「Google 邮箱/链接」：填邮箱则复制，填链接则打开
      return isUrl(value)
        ? { key, icon: 'google', label: 'Google', value, href: value }
        : { key, icon: 'google', label: 'Google 邮箱', value };
    case 'qq':
      return { key, icon: 'qq', label: 'QQ 号', value };
    case 'wechat':
      return { key, icon: 'wechat', label: '微信号', value };
  }
}

/** 按固定顺序返回已填写的社交账号 */
export function resolveSocials(social: Partial<Record<string, string>> | undefined): SocialEntry[] {
  if (!social) return [];
  return SOCIAL_ORDER.flatMap((key) => {
    const value = typeof social[key] === 'string' ? social[key]!.trim() : '';
    return value ? [resolveOne(key, value)] : [];
  });
}
