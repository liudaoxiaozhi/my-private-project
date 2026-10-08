import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpenText, Clock } from 'lucide-react';

// 正文样式（代码高亮在构建时由 Shiki 写进 HTML，不再需要 highlight.js 主题）
import '../../article.css';

import { siteConfig } from '../../../siteConfig';
import ClientSocials from '../../../components/ClientSocials';
import ClientTOC, { MobileTOC } from '../../../components/ClientTOC';
import BackButton from '../../../components/BackButton';
import SidebarLyric from '../../../components/SidebarLyric';
import ArticleEnhancer from '../../../components/article/ArticleEnhancer';
import ArticleProgress from '../../../components/article/ArticleProgress';
import ArticleReaderSettings from '../../../components/article/ArticleReaderSettings';
import LazyComments from '../../../components/article/LazyComments';
import PostNeighbors from '../../../components/article/PostNeighbors';
import SeriesNav from '../../../components/article/SeriesNav';
import {
  formatDisplayDate,
  getAdjacentPosts,
  getPostBySlug,
  getPostSlugs,
  getRelatedPosts,
  getSeriesPosts,
  toPlainText,
  toTimestamp,
} from '../../../lib/content';
import { renderArticle } from '../../../lib/markdown';
import { ARTICLE_CONTENT_ID, ARTICLE_LAYOUT_CLASS, articleSettingsScript } from '../../../lib/articleReader';
import AppImage from '../../../components/AppImage';

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

/** 构建时为 posts/ 下每篇文章生成静态页（SSG） */
export function generateStaticParams(): Array<{ slug: string }> {
  return getPostSlugs().map((slug) => ({ slug }));
}

/** 只认构建时存在的文章，其他路径直接 404（新文章随「同步 → 推送 → 重新部署」上线） */
export const dynamicParams = false;

const DESCRIPTION_LENGTH = 120;

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: `文章不存在 | ${siteConfig.title}` };

  const description = post.description || toPlainText(post.content).slice(0, DESCRIPTION_LENGTH);
  const cover = post.cover || siteConfig.defaultPostCover;
  const publishedAt = toTimestamp(post.date);

  return {
    title: `${post.title} | ${siteConfig.title}`,
    description,
    keywords: post.tags,
    authors: [{ name: siteConfig.authorName }],
    alternates: { canonical: `/posts/${encodeURIComponent(slug)}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      siteName: siteConfig.title,
      locale: 'zh_CN',
      images: cover ? [{ url: cover, alt: post.title }] : undefined,
      publishedTime: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      authors: [siteConfig.authorName],
      tags: post.tags,
    },
    twitter: {
      card: cover ? 'summary_large_image' : 'summary',
      title: post.title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function Post({ params }: PostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const article = await renderArticle(post.content);
  const cover = post.cover || siteConfig.defaultPostCover;
  const { prev, next } = getAdjacentPosts(slug);
  const seriesPosts = getSeriesPosts(post.series);
  // 相关推荐：按共同标签 / 同系列排序，不够时用最新文章补齐
  const relatedPosts = getRelatedPosts(slug, 3);

  const chip = 'flex items-center gap-1.5 md:gap-2 font-bold bg-white/30 dark:bg-slate-900/50 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm transition-colors duration-700 shadow-sm border border-white/20 dark:border-white/5';

  return (
    <div className="min-h-screen relative pb-20">
      <ArticleProgress storageKey={`post:${slug}`} />
      <main
        className={`${ARTICLE_LAYOUT_CLASS} w-[95%] md:w-[90%] max-w-6xl mx-auto mt-24 md:mt-28 flex flex-col lg:flex-row gap-6 md:gap-8 relative z-10 transition-[max-width] duration-500`}
        suppressHydrationWarning
      >

        <article className="flex-1 min-w-0 bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/40 dark:border-white/10 overflow-hidden transition-colors duration-700">
          <div className="w-full aspect-video bg-slate-200 dark:bg-slate-700 relative group">
            <AppImage data-vt-hero src={cover} alt={post.title} fill sizes="(min-width: 1024px) 800px, 95vw" loading="eager" fetchPriority="high" className="w-full h-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105" />
          </div>

          <div className="p-5 md:p-12 relative">
            <BackButton />

            <header className="mb-6 md:mb-8 border-b border-slate-300/50 dark:border-slate-700 pb-5 md:pb-6 relative">
              <h1 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight transition-colors duration-700 pr-16 md:pr-24 leading-snug text-balance">
                {post.title}
              </h1>

              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                {post.date && (
                  <div className={`${chip} text-indigo-700 dark:text-indigo-400`}>
                    <Clock className="w-3 h-3 md:w-4 md:h-4" />
                    {formatDisplayDate(post.date)}
                  </div>
                )}

                <div className={`${chip} text-slate-600 dark:text-slate-300`} title={`全文约 ${article.wordCount} 字`}>
                  <BookOpenText className="w-3 h-3 md:w-4 md:h-4" />
                  约 {article.readingMinutes} 分钟 · {article.wordCount.toLocaleString('zh-CN')} 字
                </div>

                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/timeline?tag=${encodeURIComponent(tag)}`}
                    title={`查看所有「${tag}」文章`}
                    className={`${chip} gap-1 text-pink-600 dark:text-pink-400 hover:bg-pink-500/10 hover:border-pink-400/40`}
                  >
                    <span className="text-[10px] md:text-xs opacity-70">#</span> {tag}
                  </Link>
                ))}

                <div className="ml-auto">
                  <ArticleReaderSettings />
                </div>
              </div>
            </header>

            <SeriesNav series={post.series} posts={seriesPosts} currentSlug={slug} />

            <div
              id={ARTICLE_CONTENT_ID}
              className="article-prose text-slate-800 dark:text-slate-200 transition-colors duration-700"
              suppressHydrationWarning
              dangerouslySetInnerHTML={{ __html: article.html }}
            />
            {/* 首屏绘制前套用读者保存的阅读设置（字号、行距、专注模式） */}
            <script dangerouslySetInnerHTML={{ __html: articleSettingsScript }} />
            <ArticleEnhancer />

            <PostNeighbors prev={prev} next={next} />

            <div className="mt-12 md:mt-16">
              <LazyComments />
            </div>

          </div>
        </article>

        <aside className="w-full lg:w-[320px] flex flex-col gap-6 flex-shrink-0">
          <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl text-center">
            <div className="w-20 h-20 mx-auto rounded-full p-1 bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-md mb-4 transition-transform duration-500 hover:rotate-3">
              <AppImage src={siteConfig.avatarUrl} alt={siteConfig.authorName} width={160} height={160} className="w-full h-full rounded-full object-cover bg-white" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{siteConfig.authorName}</h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium mb-4">{siteConfig.bio}</p>
            <ClientSocials />
          </div>

          <SidebarLyric />

          {relatedPosts.length > 0 && (
            <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl">
              <h3 className="font-black text-slate-900 dark:text-white mb-4 border-l-4 border-indigo-500 pl-2 text-sm">RELATED</h3>
              <div className="space-y-4">
                {relatedPosts.map((p) => (
                  <Link key={p.slug} href={`/posts/${p.slug}`} className="group flex items-center gap-3">
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700">
                      <AppImage data-vt-cover src={p.cover || siteConfig.defaultPostCover} alt="" fill sizes="64px" className="object-cover transition-transform duration-500 group-hover:scale-110" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 leading-snug">{p.title}</h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-bold">
                        {formatDisplayDate(p.date)}
                        {p.tags.some((t) => post.tags.includes(t)) && <span className="ml-2 text-pink-500/80">#{p.tags.find((t) => post.tags.includes(t))}</span>}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {article.toc.length > 0 && (
            <div className="hidden lg:block sticky top-28">
              <ClientTOC toc={article.toc} />
            </div>
          )}
        </aside>
      </main>
      <MobileTOC toc={article.toc} />
    </div>
  );
}
