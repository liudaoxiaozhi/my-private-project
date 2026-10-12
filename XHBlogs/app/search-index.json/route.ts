// app/search-index.json/route.ts —— ⌘K 命令面板的搜索索引，构建时生成为静态 JSON（新内容随重新部署更新）
import { formatDisplayDate, getAllChatters, getAllPosts } from '../../lib/content';
import { bookHref, getAllBooks } from '../../lib/novel';
import { readAnimeList } from '../../lib/server/animeStore';
import { KIND_LABEL, statusLabel } from '../../lib/anime';
import type { SearchIndex } from '../../lib/searchIndex';

export const dynamic = 'force-static';

export function GET(): Response {
  const index: SearchIndex = {
    posts: getAllPosts().map((p) => ({
      href: `/posts/${encodeURIComponent(p.slug)}`,
      title: p.title,
      meta: formatDisplayDate(p.date, ''),
      keywords: [p.description, ...p.tags, p.series].join(' '),
    })),
    chatters: getAllChatters().map((c) => ({
      href: `/chatter/${encodeURIComponent(c.slug)}`,
      title: c.title || '碎片记录',
      meta: formatDisplayDate(c.date, ''),
      keywords: [c.excerpt, ...c.tags, c.mood].join(' '),
    })),
    books: getAllBooks().map((b) => ({
      href: bookHref(b.slug),
      title: `《${b.title}》`,
      meta: [b.author, b.category].filter(Boolean).join(' · '),
      keywords: [b.title, ...b.tags, b.status].join(' '),
    })),
    media: readAnimeList().map((a) => ({
      href: '/media',
      title: a.title,
      meta: `${KIND_LABEL[a.kind]} · ${statusLabel(a.status, a.kind)}`,
      keywords: [a.originalTitle, a.creator].join(' '),
    })),
  };
  return Response.json(index);
}
