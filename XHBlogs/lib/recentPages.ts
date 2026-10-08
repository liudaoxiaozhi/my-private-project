// lib/recentPages.ts —— 「最近看过」：命令面板里列出读者最近打开的几页（只存在读者自己的浏览器里）
import { readJSON, writeJSON } from './localStore';

export interface RecentPage {
  href: string;
  title: string;
}

const KEY = 'recent-pages';
const LIMIT = 8;

export function loadRecentPages(): RecentPage[] {
  const list = readJSON<RecentPage[]>(KEY);
  return Array.isArray(list) ? list.filter((p) => typeof p?.href === 'string' && typeof p?.title === 'string') : [];
}

export function recordRecentPage(page: RecentPage): void {
  const rest = loadRecentPages().filter((p) => p.href !== page.href);
  writeJSON(KEY, [page, ...rest].slice(0, LIMIT));
}
