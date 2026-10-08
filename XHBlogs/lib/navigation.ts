// lib/navigation.ts —— 全站导航结构（导航栏、手机轮盘、⌘K 命令面板共用）
import { Clapperboard, Images, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavLink {
  name: string;
  href: string;
}

export interface NavGroup {
  name: string;
  children: Array<NavLink & { Icon: LucideIcon; hint: string }>;
}

export type NavItem = NavLink | NavGroup;

export const isGroup = (item: NavItem): item is NavGroup => 'children' in item;

/** 当前页是否属于该链接（子页面也算，例如 /novel/xxx 属于「书架」） */
export const matchPath = (pathname: string | null, href: string): boolean =>
  !!pathname && (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

export const NAV_ITEMS: NavItem[] = [
  { name: '首页', href: '/' },
  { name: '项目', href: '/projects' },
  { name: '归档', href: '/timeline' },
  { name: '音乐', href: '/music' },
  { name: '说说', href: '/moments' },
  { name: '杂谈', href: '/chatter' },
  { name: '书架', href: '/novel' },
  {
    name: '我的',
    children: [
      { name: '照片墙', href: '/photowall', Icon: Images, hint: '相册与插画收藏' },
      { name: '账单', href: '/bills', Icon: Wallet, hint: '收支统计' },
      { name: '追番', href: '/anime', Icon: Clapperboard, hint: '番剧与电影' },
    ],
  },
  { name: '友链', href: '/friends' },
  { name: '关于', href: '/about' },
];

/** 平铺后的全部页面链接（分组展开） */
export const ALL_NAV_LINKS: NavLink[] = NAV_ITEMS.flatMap((item) =>
  isGroup(item) ? item.children.map(({ name, href }) => ({ name, href })) : [item],
);
