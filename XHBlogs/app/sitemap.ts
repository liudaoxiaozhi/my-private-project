// app/sitemap.ts —— 构建时生成 /sitemap.xml
import type { MetadataRoute } from 'next';
import { getAllChatters, getAllPosts, toTimestamp } from '../lib/content';
import { absoluteUrl } from '../lib/site';
import { bookHref, chapterHref, getAllBooks, getAllChapters } from '../lib/novel';

/** 导航栏中的静态页面及其相对权重 */
const STATIC_ROUTES: ReadonlyArray<{ path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }> = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/timeline', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/chatter', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/novel', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/moments', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/projects', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/photowall', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/bills', priority: 0.3, changeFrequency: 'weekly' },
  { path: '/anime', priority: 0.4, changeFrequency: 'weekly' },
  { path: '/music', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/tree', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/friends', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
];

function toLastModified(date: string): Date | undefined {
  const t = toTimestamp(date);
  return t ? new Date(t) : undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const chatters = getAllChatters();
  const latest = toLastModified(posts[0]?.date ?? '');

  return [
    ...STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
      url: absoluteUrl(path),
      lastModified: path === '/' || path === '/timeline' ? latest : undefined,
      changeFrequency,
      priority,
    })),
    ...posts.map((post) => ({
      url: absoluteUrl(`/posts/${encodeURIComponent(post.slug)}`),
      lastModified: toLastModified(post.date),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
    ...getAllBooks().map((book) => ({
      url: absoluteUrl(bookHref(book.slug)),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...getAllChapters().map((c) => ({
      url: absoluteUrl(chapterHref(c)),
      lastModified: toLastModified(c.date),
      changeFrequency: 'yearly' as const,
      priority: 0.7,
    })),
    ...chatters.map((chatter) => ({
      url: absoluteUrl(`/chatter/${encodeURIComponent(chatter.slug)}`),
      lastModified: toLastModified(chatter.date),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
