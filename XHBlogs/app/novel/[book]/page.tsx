// app/novel/[book]/page.tsx —— 书页：封面、简介、状态、目录（按卷分组）
//
// 有章节的书显示目录与「开始阅读」；只有 _book.md 的书单条目只展示书目信息和外部链接。
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import PageTransition from '../../../components/PageTransition';
import ContinueReading from '../../../components/novel/ContinueReading';
import NovelMusicButton from '../../../components/novel/NovelMusicButton';
import BookCover from '../../../components/novel/BookCover';
import { siteConfig } from '../../../siteConfig';
import { formatDisplayDate } from '../../../lib/content';
import { renderMarkdown } from '../../../lib/markdown';
import { chapterHref, formatWordCount, getAllBooks, getBook, getNovelStats, getVolumes } from '../../../lib/novel';
import { GLASS, STATUS_STYLE } from '../../../components/novel/novelStyles';

interface BookPageProps {
  params: Promise<{ book: string }>;
}

export function generateStaticParams(): Array<{ book: string }> {
  return getAllBooks().map((b) => ({ book: b.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const book = getBook((await params).book);
  if (!book) return { title: `书不存在 | ${siteConfig.title}` };
  return {
    title: `${book.title} | 书架 | ${siteConfig.title}`,
    description: book.intro.slice(0, 120) || book.title,
    openGraph: book.cover ? { images: [{ url: book.cover, alt: book.title }] } : undefined,
  };
}

export default async function BookPage({ params }: BookPageProps) {
  const book = getBook((await params).book);
  if (!book) notFound();

  const volumes = getVolumes(book.slug);
  const stats = getNovelStats(book.slug);
  const allChapters = volumes.flatMap((v) => v.chapters);
  const readable = allChapters.length > 0;
  const introHtml = book.intro ? await renderMarkdown(book.intro) : '';

  return (
    <div className="relative min-h-screen pb-24">
      <Navbar />
      <PageTransition>
        <main className="relative z-10 mx-auto mt-24 w-full max-w-5xl px-4 sm:px-6 md:mt-28 lg:px-8">
          <Link
            href="/novel"
            className="mb-4 inline-flex items-center gap-1 rounded-full bg-white/50 px-3 py-1.5 text-sm font-bold text-slate-600 ring-1 ring-white/40 backdrop-blur-md transition-colors duration-300 hover:bg-white/70 dark:bg-slate-800/50 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-700/60"
          >
            <ChevronLeft size={16} /> 书架
          </Link>

          {/* ================= 书的信息 ================= */}
          <section className={`${GLASS} flex flex-col gap-6 p-5 sm:flex-row sm:gap-8 sm:p-8`}>
            <BookCover book={book} sizes="192px" eager className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-48" />

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-bold text-indigo-700 ring-1 ring-indigo-500/30 dark:text-indigo-300">{book.category}</span>
                {readable && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${STATUS_STYLE[book.status]}`}>{book.status}</span>}
                {book.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/50 px-2.5 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-white/50 dark:bg-slate-900/40 dark:text-slate-300 dark:ring-white/10">
                    #{tag}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 text-3xl font-black leading-tight text-slate-900 [text-wrap:balance] dark:text-white sm:text-4xl">{book.title}</h1>
              {book.author && <p className="mt-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">{book.author}{readable ? ' 著' : ''}</p>}
              {book.publisher && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{book.publisher}</p>}

              {readable ? (
                <>
                  <dl className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-white/40 p-3 text-center ring-1 ring-white/40 dark:bg-slate-900/30 dark:ring-white/5 sm:max-w-md">
                    <div>
                      <dt className="text-[11px] font-bold tracking-widest text-slate-500 dark:text-slate-400">字数</dt>
                      <dd className="mt-0.5 text-lg font-black tabular-nums text-slate-900 dark:text-white">{formatWordCount(stats.wordCount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold tracking-widest text-slate-500 dark:text-slate-400">章节</dt>
                      <dd className="mt-0.5 text-lg font-black tabular-nums text-slate-900 dark:text-white">{stats.chapterCount}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-bold tracking-widest text-slate-500 dark:text-slate-400">卷</dt>
                      <dd className="mt-0.5 text-lg font-black tabular-nums text-slate-900 dark:text-white">{volumes.length}</dd>
                    </div>
                  </dl>

                  {stats.latest && (
                    <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-bold text-slate-500 dark:text-slate-400">最近更新：</span>
                      <Link href={chapterHref(stats.latest)} className="font-bold text-indigo-600 underline-offset-4 transition-colors duration-300 hover:underline dark:text-indigo-400">
                        {stats.latest.title}
                      </Link>
                      {stats.latest.date && <span className="ml-2 tabular-nums text-slate-500 dark:text-slate-400">{formatDisplayDate(stats.latest.date)}</span>}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <ContinueReading bookSlug={book.slug} firstHref={chapterHref(allChapters[0])} validHrefs={allChapters.map(chapterHref)} />
                    <NovelMusicButton className="bg-white/60 text-slate-700 ring-1 ring-white/50 backdrop-blur-md dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10" />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-5 rounded-2xl bg-white/40 px-4 py-3 text-sm text-slate-600 ring-1 ring-white/40 dark:bg-slate-900/30 dark:text-slate-300 dark:ring-white/5 sm:max-w-md">
                    这本书在书单里，本站只收录书目信息，不提供在线阅读。
                  </p>
                  {book.link && (
                    <div className="mt-6">
                      <a
                        href={book.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                      >
                        <ExternalLink size={16} /> 在豆瓣查看
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* ================= 简介 ================= */}
          {introHtml && (
            <section className={`${GLASS} mt-6 p-5 sm:p-8`} aria-labelledby="novel-intro">
              <h2 id="novel-intro" className="mb-3 text-sm font-black tracking-widest text-slate-500 dark:text-slate-400">简介</h2>
              <div
                className="space-y-3 text-[15px] leading-8 text-slate-700 [&_p]:indent-[2em] dark:text-slate-300"
                dangerouslySetInnerHTML={{ __html: introHtml }}
              />
            </section>
          )}

          {/* ================= 目录 ================= */}
          {readable && (
            <section className="mt-6 space-y-4" aria-labelledby="novel-toc">
              <h2 id="novel-toc" className="px-1 text-sm font-black tracking-widest text-slate-500 dark:text-slate-400">目录</h2>
              {volumes.map((volume) => {
                const words = volume.chapters.reduce((sum, c) => sum + c.wordCount, 0);
                return (
                  <details key={volume.slug} open className={`${GLASS} group overflow-hidden`}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors duration-300 hover:bg-white/30 dark:hover:bg-white/5 sm:px-7 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-black text-slate-900 dark:text-white">{volume.title}</h3>
                        {volume.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{volume.description}</p>}
                      </div>
                      <span className="flex shrink-0 items-center gap-3 text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
                        {volume.chapters.length} 章 · {formatWordCount(words)} 字
                        <svg className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                      </span>
                    </summary>
                    <ol className="grid grid-cols-1 border-t border-white/40 dark:border-white/5 md:grid-cols-2">
                      {volume.chapters.map((chapter) => (
                        <li key={chapter.chapterSlug} className="border-b border-white/30 last:border-b-0 dark:border-white/5 md:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                          <Link
                            href={chapterHref(chapter)}
                            className="flex items-baseline justify-between gap-3 px-5 py-3.5 transition-colors duration-300 hover:bg-white/40 dark:hover:bg-white/5 sm:px-7"
                          >
                            <span className="min-w-0 truncate text-[15px] font-medium text-slate-800 dark:text-slate-200">{chapter.title}</span>
                            <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {chapter.date ? formatDisplayDate(chapter.date).split(' ')[0] : `${formatWordCount(chapter.wordCount)} 字`}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </details>
                );
              })}
            </section>
          )}
        </main>
      </PageTransition>
    </div>
  );
}
