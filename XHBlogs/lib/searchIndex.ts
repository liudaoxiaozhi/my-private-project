// lib/searchIndex.ts —— ⌘K 命令面板的搜索数据格式（由 app/search-index.json/route.ts 在构建时生成）
// 只放标题、摘要、标签这类短字段，正文不进索引，面板第一次打开时才下载。

export interface SearchEntry {
  /** 站内链接 */
  href: string;
  title: string;
  /** 副标题：日期、作者、状态等 */
  meta: string;
  /** 参与搜索、但不显示的文字：摘要、标签、原名 */
  keywords: string;
}

export interface SearchIndex {
  posts: SearchEntry[];
  chatters: SearchEntry[];
  books: SearchEntry[];
  anime: SearchEntry[];
}

export const SEARCH_INDEX_URL = '/search-index.json';
