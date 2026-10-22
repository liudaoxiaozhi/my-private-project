// 数学公式样式只在会渲染公式的页面加载（不放根布局，其他页面不用下载）
import 'katex/dist/katex.min.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// 正文样式（与文章页共用；代码高亮在构建时由 Shiki 写进 HTML）
import '../../article.css';

import { siteConfig } from '../../../siteConfig';
import ClientSocials from '../../../components/ClientSocials';
import SidebarLyric from '../../../components/SidebarLyric';
import BackButton from '../../../components/BackButton';
import ArticleEnhancer from '../../../components/article/ArticleEnhancer';
import ArticleProgress from '../../../components/article/ArticleProgress';
import ArticleReaderSettings from '../../../components/article/ArticleReaderSettings';
import { getChatterBySlug, getChatterSlugs, getRecentChatters, toTimestamp } from '../../../lib/content';
import { renderArticle } from '../../../lib/markdown';
import { ARTICLE_CONTENT_ID, ARTICLE_LAYOUT_CLASS, articleSettingsScript } from '../../../lib/articleReader';
import AppImage from '../../../components/AppImage';

interface ChatterPageProps {
  params: Promise<{ slug: string }>;
}

const DEFAULT_CHATTER_TITLE = '碎片记录';

export function generateStaticParams(): Array<{ slug: string }> {
  return getChatterSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: ChatterPageProps): Promise<Metadata> {
  const { slug } = await params;
  const chatter = getChatterBySlug(slug);
  if (!chatter) return { title: `记录不存在 | ${siteConfig.title}` };

  const title = chatter.title || DEFAULT_CHATTER_TITLE;
  const cover = chatter.cover || siteConfig.defaultPostCover;
  const publishedAt = toTimestamp(chatter.date);

  return {
    title: `${title} | ${siteConfig.chatterTitle} | ${siteConfig.title}`,
    description: chatter.excerpt,
    keywords: chatter.tags,
    alternates: { canonical: `/chatter/${encodeURIComponent(slug)}` },
    openGraph: {
      type: 'article',
      title,
      description: chatter.excerpt,
      siteName: siteConfig.title,
      locale: 'zh_CN',
      images: cover ? [{ url: cover, alt: title }] : undefined,
      publishedTime: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      tags: chatter.tags,
    },
    twitter: { card: cover ? 'summary_large_image' : 'summary', title, description: chatter.excerpt },
  };
}

/** 从 "YYYY-MM-DD ..." 直接取年月日，不经过 Date 时区换算，避免构建机时区把日期算错一天 */
function parseYmd(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(date);
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const fallback = new Date(toTimestamp(date) || Date.UTC(2026, 2, 24));
  return { year: fallback.getUTCFullYear(), month: fallback.getUTCMonth() + 1, day: fallback.getUTCDate() };
}

function generateCalendarMatrix(year: number, month: number, targetDay: number) {
  // 用 UTC 计算星期与天数，结果不受构建机时区影响
  const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const days: Array<number | null> = [];
  for (let i = 0; i < startDay; i++) { days.push(null); }
  for (let i = 1; i <= daysInMonth; i++) { days.push(i); }
  return { days, targetDay };
}

export default async function ChatterDetail({ params }: ChatterPageProps) {
  const { slug } = await params;
  const chatter = getChatterBySlug(slug);
  if (!chatter) notFound();

  // 杂谈沿用旧行为：未标注语言的代码块默认按 C++ 高亮
  const article = await renderArticle(chatter.content, { defaultCodeLang: 'cpp' });
  const chatterData = {
    ...chatter,
    title: chatter.title || DEFAULT_CHATTER_TITLE,
    cover: chatter.cover || siteConfig.defaultPostCover,
  };
  const recentChatters = getRecentChatters(slug, 3).map((c) => ({ ...c, title: c.title || DEFAULT_CHATTER_TITLE }));

  const { year: yearStr, month: monthNum, day: dayNum } = parseYmd(chatterData.date);

  const { days: calendarDays } = generateCalendarMatrix(yearStr, monthNum, dayNum);
  const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div className="min-h-screen relative pb-20">
      <ArticleProgress storageKey={`chatter:${slug}`} />

      <main
        className={`${ARTICLE_LAYOUT_CLASS} w-[95%] md:w-[90%] max-w-6xl mx-auto mt-8 md:mt-28 flex flex-col lg:flex-row gap-6 md:gap-8 relative z-10 transition-[max-width] duration-500`}
        suppressHydrationWarning
      >

        <article className="glass-card flex-1 min-w-0 overflow-hidden transition-colors duration-700">
          {chatterData.cover && (
            <div className="w-full aspect-video bg-slate-200 dark:bg-slate-700 relative group">
              <AppImage data-vt-hero src={chatterData.cover} alt={chatterData.title} fill sizes="(min-width: 1024px) 800px, 95vw" loading="eager" fetchPriority="high" className="w-full h-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105" />
            </div>
          )}

          <div className="p-5 md:p-14 relative">
            <BackButton />

            <header className="mb-6 md:mb-10 border-b border-slate-300/30 dark:border-slate-700/50 pb-5 md:pb-8 relative">
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 dark:text-white mb-4 md:mb-6 tracking-tight transition-colors duration-700 pr-16 md:pr-24 leading-snug md:leading-tight">
                {chatterData.title}
              </h1>

              {/* ✅ 前端展示版：特权修改按钮已彻底移除！ */}

              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <div className="flex items-center gap-1.5 md:gap-2 text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-500/5 dark:bg-indigo-400/10 px-3 md:px-4 py-1.5 md:py-2 rounded-2xl text-xs md:text-sm border border-indigo-500/10">
                  <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {chatterData.date}
                </div>

                {chatterData.mood && (
                  <div className="flex items-center gap-1.5 md:gap-2 text-pink-600 dark:text-pink-400 font-black bg-pink-500/5 dark:bg-pink-400/10 px-3 md:px-4 py-1.5 md:py-2 rounded-2xl text-xs md:text-sm border border-pink-500/10">
                    ✨ 心情：{chatterData.mood}
                  </div>
                )}

                {chatterData.tags.map((tag: string) => (
                  <div key={tag} className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-bold bg-slate-500/5 dark:bg-slate-400/10 px-3 md:px-4 py-1.5 md:py-2 rounded-2xl text-xs md:text-sm border border-slate-500/10">
                    <span className="text-[10px] md:text-xs opacity-70">#</span> {tag}
                  </div>
                ))}

                <div className="flex items-center gap-1.5 md:gap-2 text-slate-500 dark:text-slate-400 font-bold bg-slate-500/5 dark:bg-slate-400/10 px-3 md:px-4 py-1.5 md:py-2 rounded-2xl text-xs md:text-sm border border-slate-500/10">
                  约 {article.readingMinutes} 分钟 · {article.wordCount.toLocaleString('zh-CN')} 字
                </div>

                <div className="ml-auto">
                  <ArticleReaderSettings />
                </div>
              </div>
            </header>

            <div
              id={ARTICLE_CONTENT_ID}
              className="article-prose text-slate-800 dark:text-slate-200 transition-colors duration-700"
              suppressHydrationWarning
              dangerouslySetInnerHTML={{ __html: article.html }}
            />
            {/* 首屏绘制前套用读者保存的阅读设置 */}
            <script dangerouslySetInnerHTML={{ __html: articleSettingsScript }} />
            <ArticleEnhancer />

          </div>
        </article>

        <aside className="w-full lg:w-[320px] flex flex-col gap-6 flex-shrink-0">
          <div className="glass-card p-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-full p-1 bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-md mb-4 hover:rotate-3 transition-transform">
              <AppImage src={siteConfig.avatarUrl} alt={siteConfig.authorName} width={160} height={160} className="w-full h-full rounded-full object-cover bg-white" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{siteConfig.authorName}</h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium mb-4">{siteConfig.bio}</p>
            <ClientSocials />
          </div>

          <SidebarLyric />

          <div className="glass-card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-wider">{yearStr}年{monthNum}月</h3>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-4 text-center">
              {weekDays.map(day => <div key={day} className="text-[10px] font-black text-slate-400 uppercase">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center">
              {calendarDays.map((day, index) => (
                <div key={index} className="flex justify-center items-center">
                  {day ? (
                    <div className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black transition-all duration-300
                      ${day === dayNum ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 scale-110' : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700'}`}>
                      {day}
                    </div>
                  ) : <div className="w-8 h-8"></div>}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-black text-slate-900 dark:text-white mb-4 border-l-4 border-indigo-500 pl-2 text-xs tracking-widest uppercase">Recent Records</h3>
            <div className="space-y-4">
              {recentChatters.map(p => (
                <Link key={p.slug} href={`/chatter/${p.slug}`} className="group block">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">{p.title}</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-bold uppercase">{p.date}</p>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}