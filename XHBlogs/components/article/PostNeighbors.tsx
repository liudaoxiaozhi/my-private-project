// components/article/PostNeighbors.tsx —— 文末「上一篇 / 下一篇」封面卡片（服务端组件）
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import AppImage from '../AppImage';
import type { PostMeta } from '../../lib/content';
import { formatDisplayDate } from '../../lib/content';
import { siteConfig } from '../../siteConfig';

function NeighborCard({ post, direction }: { post: PostMeta; direction: 'prev' | 'next' }) {
  const isNext = direction === 'next';
  return (
    <Link
      href={`/posts/${post.slug}`}
      className={`group relative flex min-h-[120px] overflow-hidden rounded-2xl border border-white/40 shadow-lg transition-transform duration-500 hover:-translate-y-1 dark:border-white/10 ${isNext ? 'sm:col-start-2' : ''}`}
    >
      <AppImage
        src={post.cover || siteConfig.defaultPostCover}
        alt=""
        fill
        sizes="(min-width: 640px) 400px, 95vw"
        className="object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className={`absolute inset-0 ${isNext ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-slate-950/85 via-slate-950/60 to-slate-950/20`} />
      <div className={`relative flex w-full flex-col justify-center gap-1.5 p-5 text-white ${isNext ? 'items-end text-right' : ''}`}>
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-widest text-white/70">
          {isNext ? (
            <>
              下一篇 <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </>
          ) : (
            <>
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" /> 上一篇
            </>
          )}
        </span>
        <span className="line-clamp-2 text-base font-bold leading-snug md:text-lg">{post.title}</span>
        {post.date && <span className="text-[11px] text-white/60">{formatDisplayDate(post.date)}</span>}
      </div>
    </Link>
  );
}

export default function PostNeighbors({ prev, next }: { prev: PostMeta | null; next: PostMeta | null }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="上一篇与下一篇" className="mt-12 grid gap-4 border-t border-slate-300/50 pt-8 dark:border-slate-700 sm:grid-cols-2 md:mt-16">
      {prev && <NeighborCard post={prev} direction="prev" />}
      {next && <NeighborCard post={next} direction="next" />}
    </nav>
  );
}
