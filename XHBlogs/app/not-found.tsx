// app/not-found.tsx —— 404 页面：网址不存在、或文章 / 杂谈被删除时显示（Server Component）
import type { Metadata } from 'next';
import Link from 'next/link';
import { Archive, Home } from 'lucide-react';
import AppImage from '../components/AppImage';
import { formatDisplayDate, getAllPosts } from '../lib/content';
import { siteConfig } from '../siteConfig';

export const metadata: Metadata = {
  title: `页面走丢了 | ${siteConfig.title}`,
};

/** 桌宠图片：角色趴在图片里 edge 比例处的台面上，这里让她趴在卡片上沿 */
const PET = { src: '/images/pet/saber.webp', width: 360, height: 364, edge: 0.9262 } as const;
const PET_WIDTH = 140;
const PET_HEIGHT = Math.round((PET_WIDTH * PET.height) / PET.width);

export default function NotFound() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <div className="relative min-h-screen pb-24">
      <main className="relative z-10 mx-auto mt-40 w-full max-w-xl px-4 sm:px-6 md:mt-44">
        <section className="relative rounded-3xl border border-white/40 bg-white/60 px-6 pb-10 pt-14 text-center shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/60 sm:px-10">
          <AppImage
            src={PET.src}
            alt=""
            width={PET_WIDTH}
            height={PET_HEIGHT}
            loading="eager"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none drop-shadow-xl"
            style={{ top: -Math.round(PET_HEIGHT * PET.edge) }}
          />

          <p className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-7xl font-black tracking-tight text-transparent sm:text-8xl">
            404
          </p>
          <h1 className="mt-3 text-2xl font-black text-slate-900 dark:text-white">Master，这里什么都没有……</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            你要找的页面可能被搬走了，或者网址里有个字打错了。我陪你回去找找吧。
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-indigo-600"
            >
              <Home size={16} /> 回到首页
            </Link>
            <Link
              href="/timeline"
              className="inline-flex items-center gap-2 rounded-full bg-white/70 px-6 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-white/60 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white dark:bg-slate-900/50 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-slate-900/70"
            >
              <Archive size={16} /> 去归档找找
            </Link>
          </div>

          {recentPosts.length > 0 && (
            <div className="mt-10 border-t border-slate-300/50 pt-6 text-left dark:border-slate-700">
              <h2 className="mb-3 text-xs font-black tracking-widest text-slate-500 dark:text-slate-400">也许你在找</h2>
              <ul className="space-y-1">
                {recentPosts.map((post) => (
                  <li key={post.slug}>
                    <Link
                      href={`/posts/${post.slug}`}
                      className="flex items-baseline justify-between gap-4 rounded-xl px-3 py-2 transition-colors hover:bg-white/60 dark:hover:bg-slate-900/40"
                    >
                      <span className="line-clamp-1 font-bold text-slate-800 dark:text-slate-200">{post.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatDisplayDate(post.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
