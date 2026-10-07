// app/novel/page.tsx —— 小说书页：封面、简介、更新状态、目录（按卷分组）
import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import AppImage from '../../components/AppImage';
import ContinueReading from '../../components/novel/ContinueReading';
import NovelMusicButton from '../../components/novel/NovelMusicButton';
import { siteConfig } from '../../siteConfig';
import { formatDisplayDate } from '../../lib/content';
import { renderMarkdown } from '../../lib/markdown';
import { chapterHref, formatWordCount, getBook, getNovelStats, getVolumes } from '../../lib/novel';
import type { NovelStatus } from '../../lib/novel';

export function generateMetadata(): Metadata {
  const book = getBook();
  const title = book ? `${book.title} | 小说 | ${siteConfig.title}` : `小说 | ${siteConfig.title}`;
  return { title, description: book?.intro.slice(0, 120) || '连载中的小说' };
}

const STATUS_STYLE: Record<NovelStatus, string> = {
  连载中: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
  已完结: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300',
  暂停更新: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300',
};

const GLASS = 'rounded-3xl border border-white/40 bg-white/55 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/55';

export default async function NovelPage() {
  const book = getBook();
  const volumes = getVolumes();
  const stats = getNovelStats();
  const allChapters = volumes.flatMap((v) => v.chapters);
  const introHtml = book?.intro ? await renderMarkdown(book.intro) : '';

  return (
    <div className="relative min-h-screen pb-24">
      <Navbar />
      <PageTransition>
        <main className="relative z-10 mx-auto mt-24 w-full max-w-5xl px-4 sm:px-6 md:mt-28 lg:px-8">
          {!book || allChapters.length === 0 ? (
            <section className={`${GLASS} px-6 py-16 text-center`}>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">小说</h1>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                还没有开始连载。按 <code className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">novel/README.md</code> 里的格式写下第一章吧。
              </p>
            </section>
          ) : (
            <>
              {/* ================= 书的信息 ================= */}
              <section className={`${GLASS} flex flex-col gap-6 p-5 sm:flex-row sm:gap-8 sm:p-8`}>
                <div className="relative mx-auto aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-2xl shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] sm:mx-0 sm:w-48">
                  {book.cover ? (
                    <AppImage src={book.cover} alt={`${book.title} 封面`} fill sizes="192px" loading="eager" className="object-cover" />
                  ) : (
                    // 没有封面时：书名竖排的纯色书封
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
                      <span className="text-2xl font-black leading-snug text-white [writing-mode:vertical-rl] [text-orientation:upright] drop-shadow">
                        {book.title}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${STATUS_STYLE[book.status]}`}>{book.status}</span>
                    {book.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/50 px-2.5 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-white/50 dark:bg-slate-900/40 dark:text-slate-300 dark:ring-white/10">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h1 className="mt-3 text-3xl font-black leading-tight text-slate-900 [text-wrap:balance] dark:text-white sm:text-4xl">{book.title}</h1>
                  {book.author && <p className="mt-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">{book.author} 著</p>}

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
                    <ContinueReading firstHref={chapterHref(allChapters[0])} validHrefs={allChapters.map(chapterHref)} />
                    <NovelMusicButton className="bg-white/60 text-slate-700 ring-1 ring-white/50 backdrop-blur-md dark:bg-slate-800/60 dark:text-slate-200 dark:ring-white/10" />
                  </div>
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
            </>
          )}
        </main>
      </PageTransition>
    </div>
  );
}
