// components/article/SeriesNav.tsx —— 系列文章目录（文章开头，可折叠）
// 服务端组件：frontmatter 写了相同 series 的文章（至少两篇）才显示。
import Link from 'next/link';
import { Library } from 'lucide-react';
import type { PostMeta } from '../../lib/content';

interface SeriesNavProps {
  series: string;
  posts: PostMeta[];
  currentSlug: string;
}

export default function SeriesNav({ series, posts, currentSlug }: SeriesNavProps) {
  if (posts.length < 2) return null;
  const index = posts.findIndex((post) => post.slug === currentSlug);

  return (
    <details className="group mb-8 overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/5 dark:border-indigo-400/20 dark:bg-indigo-400/10" open={posts.length <= 6}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <Library size={18} className="shrink-0 text-indigo-500 dark:text-indigo-400" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black tracking-widest text-indigo-500 dark:text-indigo-400">系列文章</span>
          <span className="block truncate font-bold text-slate-800 dark:text-slate-100">{series}</span>
        </span>
        <span className="shrink-0 rounded-full bg-indigo-500 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white">
          第 {index + 1} / {posts.length} 篇
        </span>
        <span className="h-2 w-2 shrink-0 -rotate-45 border-b-2 border-r-2 border-indigo-500 transition-transform duration-300 group-open:rotate-45" />
      </summary>
      <ol className="space-y-1 border-t border-indigo-500/15 px-3 py-3">
        {posts.map((post, i) => {
          const current = post.slug === currentSlug;
          return (
            <li key={post.slug}>
              <Link
                href={`/posts/${post.slug}`}
                aria-current={current ? 'page' : undefined}
                className={`flex items-baseline gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  current
                    ? 'bg-white/70 font-bold text-indigo-600 shadow-sm dark:bg-slate-900/50 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-white/50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-900/30 dark:hover:text-indigo-300'
                }`}
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums opacity-60">{i + 1}</span>
                <span className="line-clamp-1">{post.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
