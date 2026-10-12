// lib/server/openLibrary.ts —— Open Library（书）搜索（仅服务端，不需要 Key）
//
// 中文书 Bangumi 的「书籍」更全，外文书 Open Library 更全；两个都能在书影音页「书」的搜索里选。
// 文档：https://openlibrary.org/dev/docs/api/search
import type { SearchResult } from '../anime';
import { AnimeError, int, str } from './animeClean';
import { outboundFetch } from './outboundFetch';

const API = 'https://openlibrary.org/search.json';
const FIELDS = 'title,author_name,first_publish_year,cover_i,number_of_pages_median,key';
/** 允许下载封面的图片域名（animeStore 用）；封面地址会跳转到 archive.org，下载时自动跟随 */
export const OPEN_LIBRARY_COVER_HOST = 'covers.openlibrary.org';
// Open Library 希望请求带上能识别来源的 User-Agent
const USER_AGENT = 'xhblogs-anime-tracker/1.0 (local)';

interface RawDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
}

/** "/works/OL27448W" → "OL27448W" */
const workKey = (key: unknown): string | null => {
  const m = /^\/works\/(OL\d{1,12}W)$/.exec(str(key, 40));
  return m ? m[1] : null;
};

export async function searchOpenLibrary(keyword: string): Promise<SearchResult[]> {
  const url = new URL(API);
  url.searchParams.set('q', keyword);
  url.searchParams.set('limit', '20');
  url.searchParams.set('fields', FIELDS);
  let res: Response;
  try {
    res = await outboundFetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  } catch (error) {
    console.error('请求 Open Library 失败:', error);
    throw new AnimeError('连不上 Open Library，可以稍后再试，或者手动填写', 502);
  }
  if (!res.ok) throw new AnimeError(`Open Library 返回 HTTP ${res.status}`, 502);
  const data = (await res.json()) as { docs?: RawDoc[] };
  const results: SearchResult[] = [];
  for (const doc of data.docs ?? []) {
    const key = workKey(doc.key);
    const title = str(doc.title, 200);
    if (!key || !title) continue;
    const year = int(doc.first_publish_year, 0, 9999);
    const coverId = int(doc.cover_i, 0, 999_999_999);
    results.push({
      source: 'openlibrary',
      // 数字部分只用来当列表的 key；判断重复用 key（OL…W）
      id: Number(key.slice(2, -1)),
      key,
      mediaType: null,
      title,
      originalTitle: '',
      kind: 'book',
      cover: coverId > 0 ? `https://${OPEN_LIBRARY_COVER_HOST}/b/id/${coverId}-L.jpg` : '',
      totalEpisodes: int(doc.number_of_pages_median, 0, 9999),
      // 只知道年份，日期按 1 月 1 日记
      airDate: year > 0 ? `${String(year).padStart(4, '0')}-01-01` : '',
      score: 0,
      summary: '',
      tags: [],
      platform: '',
      creator: (doc.author_name ?? []).map((a) => str(a, 60)).filter(Boolean).slice(0, 3).join(' / ').slice(0, 100),
    });
  }
  return results;
}
