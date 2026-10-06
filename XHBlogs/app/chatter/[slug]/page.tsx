import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// 🌟 引入神仙代码高亮主题（Atom One Dark）
import 'highlight.js/styles/atom-one-dark.css';

import Navbar from '../../../components/Navbar';
import PageTransition from '../../../components/PageTransition';
import { siteConfig } from '../../../siteConfig';
import ClientSocials from '../../../components/ClientSocials';
import SidebarLyric from '../../../components/SidebarLyric';
import BackButton from '../../../components/BackButton';
import Comments from '../../../components/Comments';
import { getChatterBySlug, getChatterSlugs, getRecentChatters, toTimestamp } from '../../../lib/content';
import { renderMarkdown } from '../../../lib/markdown';

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

  const chatterData = {
    ...chatter,
    title: chatter.title || DEFAULT_CHATTER_TITLE,
    cover: chatter.cover || siteConfig.defaultPostCover,
    // 杂谈沿用旧行为：未标注语言的代码块默认按 C++ 高亮
    contentHtml: await renderMarkdown(chatter.content, { defaultCodeLang: 'cpp' }),
  };
  const recentChatters = getRecentChatters(slug, 3).map((c) => ({ ...c, title: c.title || DEFAULT_CHATTER_TITLE }));

  const { year: yearStr, month: monthNum, day: dayNum } = parseYmd(chatterData.date);

  const { days: calendarDays } = generateCalendarMatrix(yearStr, monthNum, dayNum);
  const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div className="min-h-screen relative pb-20">
      <Navbar />

      <PageTransition>
        <main className="w-[95%] md:w-[90%] max-w-6xl mx-auto mt-24 md:mt-28 flex flex-col lg:flex-row gap-6 md:gap-8 relative z-10">

          <article className="flex-1 bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-[40px] shadow-2xl border border-white/40 dark:border-white/10 overflow-hidden transition-colors duration-700">
            {chatterData.cover && (
              <div className="w-full aspect-video bg-slate-200 dark:bg-slate-700 relative group">
                <img src={chatterData.cover} alt="封面" className="w-full h-full object-cover opacity-90 transition-transform duration-1000 group-hover:scale-105" />
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
                </div>
              </header>

              <div className="relative">
                <style>{`
                  .prose h1 { font-size: 1.8rem !important; font-weight: 900 !important; margin-bottom: 1.2rem !important; margin-top: 2rem !important; line-height: 1.3 !important; color: inherit !important; }
                  .prose h2 { font-size: 1.5rem !important; font-weight: 800 !important; margin-bottom: 1rem !important; margin-top: 1.5rem !important; color: inherit !important; }
                  .prose h3 { font-size: 1.2rem !important; font-weight: 700 !important; margin-bottom: 0.8rem !important; color: inherit !important; }
                  .prose p { font-size: 0.95rem !important; line-height: 1.75 !important; color: inherit !important; }
                  
                  .prose a { color: #6366f1 !important; text-decoration: none !important; font-weight: 600 !important; border-bottom: 1px dashed #6366f1 !important; transition: all 0.3s ease !important; }
                  .prose a:hover { color: #4f46e5 !important; border-bottom-style: solid !important; background-color: rgba(99, 102, 241, 0.1) !important; padding: 0 0.2rem !important; border-radius: 0.2rem !important; }
                  .dark .prose a { color: #818cf8 !important; border-bottom-color: #818cf8 !important; }
                  .dark .prose a:hover { color: #a5b4fc !important; background-color: rgba(129, 140, 248, 0.15) !important; }

                  .prose ul { list-style-type: disc !important; padding-left: 1.5rem !important; font-size: 0.95rem !important; }
                  .prose ol { list-style-type: decimal !important; padding-left: 1.5rem !important; font-size: 0.95rem !important; }
                  .prose li { display: list-item !important; margin-bottom: 0.5rem !important; }
                  
                  .prose ul ul, .prose ol ul { list-style-type: circle !important; margin-top: 0.25rem !important; margin-bottom: 0.25rem !important; }
                  .prose ol ol, .prose ul ol { list-style-type: lower-alpha !important; margin-top: 0.25rem !important; margin-bottom: 0.25rem !important; }
                  
                  .prose del { text-decoration-color: inherit !important; opacity: 0.6; }

                  /* 🌟 引用块专属果冻极客风样式补丁 */
                  .prose blockquote {
                    border-left: 4px solid #6366f1 !important;
                    background-color: rgba(99, 102, 241, 0.05) !important;
                    padding: 1rem 1.5rem !important;
                    margin: 1.5rem 0 !important;
                    border-radius: 0 1.25rem 1.25rem 0 !important;
                    font-style: italic !important;
                    color: #64748b !important;
                  }
                  .prose blockquote p {
                    margin: 0 !important; 
                    color: inherit !important;
                  }
                  .dark .prose blockquote {
                    border-left-color: #818cf8 !important;
                    background-color: rgba(129, 140, 248, 0.1) !important;
                    color: #94a3b8 !important;
                  }
                  
                  .prose pre {
                    background-color: #282c34 !important; color: #abb2bf !important;
                    padding: 1rem !important; border-radius: 0.75rem !important;
                    overflow-x: auto !important; box-shadow: inset 0 0 10px rgba(0,0,0,0.3) !important;
                    margin-top: 1rem !important; margin-bottom: 1rem !important;
                  }
                  
                  .prose pre code, .prose p code, .prose li code { 
                    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, ui-monospace, monospace !important; 
                    font-variant-ligatures: contextual !important; 
                  }
                  .prose pre code { 
                    background-color: transparent !important; 
                    padding: 0 !important; 
                    color: inherit !important; 
                    font-size: 0.85em !important; 
                  }
                  
                  .prose code::before, .prose code::after { content: none !important; }
                  .prose p code, .prose li code { background-color: rgba(99, 102, 241, 0.1) !important; color: #6366f1 !important; padding: 0.1rem 0.3rem !important; border-radius: 0.25rem !important; font-weight: 600 !important; font-size: 0.85em !important; }
                  .dark .prose p code, .dark .prose li code { background-color: rgba(99, 102, 241, 0.2) !important; color: #818cf8 !important; }
                  .prose img { display: block !important; margin: 1.5rem auto !important; border-radius: 1rem !important; box-shadow: 0 10px 30px rgba(0,0,0,0.1) !important; max-width: 100% !important; height: auto !important; }

                  .prose pre code .hljs-comment, .prose pre code .hljs-quote { color: #5c6370 !important; font-style: italic !important; }
                  .prose pre code .hljs-doctag, .prose pre code .hljs-keyword, .prose pre code .hljs-formula { color: #c678dd !important; }
                  .prose pre code .hljs-keyword.type_, .prose pre code .hljs-type { color: #c678dd !important; } 
                  .prose pre code .hljs-section, .prose pre code .hljs-name, .prose pre code .hljs-selector-tag, .prose pre code .hljs-deletion, .prose pre code .hljs-subst { color: #e06c75 !important; }
                  .prose pre code .hljs-literal { color: #56b6c2 !important; }
                  .prose pre code .hljs-string, .prose pre code .hljs-regexp, .prose pre code .hljs-addition, .prose pre code .hljs-attribute, .prose pre code .hljs-meta-string { color: #98c379 !important; }
                  .prose pre code .hljs-built_in, .prose pre code .hljs-class .hljs-title, .prose pre code .hljs-title.class_ { color: #e6c07b !important; } 
                  .prose pre code .hljs-attr, .prose pre code .hljs-variable, .prose pre code .hljs-template-variable, .prose pre code .hljs-selector-class, .prose pre code .hljs-selector-attr, .prose pre code .hljs-selector-pseudo, .prose pre code .hljs-number { color: #d19a66 !important; }
                  .prose pre code .hljs-symbol, .prose pre code .hljs-bullet, .prose pre code .hljs-link, .prose pre code .hljs-meta, .prose pre code .hljs-selector-id, .prose pre code .hljs-title, .prose pre code .hljs-title.function_ { color: #61aeee !important; } 

                  @media (min-width: 768px) {
                    .prose h1 { font-size: 3rem !important; font-weight: 950 !important; margin-bottom: 2rem !important; margin-top: 3rem !important; line-height: 1.1 !important; }
                    .prose h2 { font-size: 2.2rem !important; margin-bottom: 1.5rem !important; margin-top: 2rem !important; }
                    .prose h3 { font-size: 1.5rem !important; margin-bottom: 1rem !important; }
                    .prose p { font-size: 1.15rem !important; line-height: 1.85 !important; }
                    
                    .prose ul, .prose ol { padding-left: 2rem !important; font-size: 1.1rem !important; }
                    
                    .prose pre { padding: 1.25rem !important; margin-top: 1.5rem !important; margin-bottom: 1.5rem !important; }
                    .prose pre code { font-size: 0.9em !important; }
                    .prose p code, .prose li code { padding: 0.2rem 0.4rem !important; font-size: 0.9em !important; border-radius: 0.375rem !important;}
                    .prose img { margin: 2rem auto !important; border-radius: 2rem !important; box-shadow: 0 20px 50px rgba(0,0,0,0.15) !important; }
                  }
                `}</style>

                <div
                  className="prose prose-slate dark:prose-invert prose-base md:prose-lg max-w-none text-slate-800 dark:text-slate-200 font-serif transition-colors duration-700 leading-relaxed scroll-smooth"
                  dangerouslySetInnerHTML={{ __html: chatterData.contentHtml }}
                />
              </div>

              <div className="mt-10 md:mt-12">
                <Comments />
              </div>

            </div>
          </article>

          <aside className="w-full lg:w-[320px] flex flex-col gap-6 flex-shrink-0">
            <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl text-center">
              <div className="w-20 h-20 mx-auto rounded-full p-1 bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-md mb-4 hover:rotate-3 transition-transform">
                <img src={siteConfig.avatarUrl} alt="avatar" className="w-full h-full rounded-full object-cover bg-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{siteConfig.authorName}</h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium mb-4">{siteConfig.bio}</p>
              <ClientSocials />
            </div>

            <SidebarLyric />

            <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl">
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

            <div className="bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-3xl p-6 border border-white/40 dark:border-white/10 shadow-xl">
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
      </PageTransition>
    </div>
  );
}