// app/novel/page.tsx —— 书架：按分类展示所有书（可在线阅读的书 + 书单条目）
//
// 每个分类一块毛玻璃面板，面板里的书卡本身不再叠加 backdrop-blur，避免多层模糊拖慢滚动。
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import BookCover from '../../components/novel/BookCover';
import { GLASS } from '../../components/novel/novelStyles';
import { siteConfig } from '../../siteConfig';
import { bookHref, formatWordCount, getShelf } from '../../lib/novel';
import type { BookSummary } from '../../lib/novel';

export const metadata: Metadata = {
  title: `书架 | ${siteConfig.title}`,
  description: '在连载的小说与私藏书单',
};

const STATUS_DOT: Record<BookSummary['status'], string> = {
  连载中: 'bg-emerald-500',
  已完结: 'bg-indigo-500',
  暂停更新: 'bg-amber-500',
};

function BookCard({ book, eager }: { book: BookSummary; eager: boolean }) {
  return (
    <li>
      <Link
        href={bookHref(book.slug)}
        className="group flex h-full flex-col rounded-2xl p-2 transition-all duration-300 ease-out hover:-translate-y-1 hover:bg-white/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:hover:bg-white/5 sm:p-3"
      >
        <BookCover
          book={book}
          sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
          eager={eager}
          titleClassName="text-lg sm:text-xl"
          className="w-full transition-shadow duration-300 group-hover:shadow-[0_22px_44px_-12px_rgba(0,0,0,0.5)]"
        />
        <h3 className="mt-3 line-clamp-2 text-[15px] font-black leading-snug text-slate-900 dark:text-white">{book.title}</h3>
        {book.author && <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{book.author}</p>}
        <p className="mt-auto flex items-center gap-1.5 pt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          {book.readable ? (
            <>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[book.status]}`} aria-hidden="true" />
              <span className="truncate tabular-nums">{book.status} · {formatWordCount(book.stats.wordCount)} 字</span>
            </>
          ) : (
            <>
              <span className="shrink-0 rounded bg-slate-500/10 px-1.5 py-px text-[11px] dark:bg-white/10">书单</span>
              {book.publisher && <span className="truncate font-medium">{book.publisher}</span>}
            </>
          )}
        </p>
      </Link>
    </li>
  );
}

export default function NovelShelfPage() {
  const shelf = getShelf();
  const books = shelf.flatMap((c) => c.books);
  const readableCount = books.filter((b) => b.readable).length;

  return (
    <div className="relative min-h-screen pb-24">
      <main className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6 md:mt-28 lg:px-8">
        <header className={`${GLASS} px-5 py-6 sm:px-8 sm:py-8`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">书架</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {books.length > 0 ? `共 ${books.length} 本，其中 ${readableCount} 本可以在站内阅读` : '书架还是空的'}
              </p>
            </div>
            <Link
              href="/novel/epub"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
              title="在浏览器里打开你自己的 EPUB 文件，不会上传"
            >
              <BookOpen size={16} /> 打开本地 EPUB
            </Link>
          </div>
          {shelf.length > 1 && (
            <nav aria-label="分类" className="mt-5 flex flex-wrap gap-2">
              {shelf.map((category, i) => (
                <a
                  key={category.name}
                  href={`#shelf-${i}`}
                  className="rounded-full bg-white/60 px-3.5 py-1.5 text-sm font-bold text-slate-700 ring-1 ring-white/50 transition-colors duration-300 hover:bg-indigo-500 hover:text-white dark:bg-slate-900/40 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-indigo-600"
                >
                  {category.name}
                  <span className="ml-1.5 tabular-nums opacity-60">{category.books.length}</span>
                </a>
              ))}
            </nav>
          )}
        </header>

        {books.length === 0 ? (
          <p className={`${GLASS} mt-6 px-6 py-12 text-center text-sm text-slate-600 dark:text-slate-400`}>
            按 <code className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">novel/README.md</code> 里的格式放进第一本书吧。
          </p>
        ) : (
          shelf.map((category, i) => (
            <section key={category.name} id={`shelf-${i}`} aria-labelledby={`shelf-${i}-title`} className={`${GLASS} mt-6 scroll-mt-28 p-3 sm:p-5`}>
              <h2 id={`shelf-${i}-title`} className="flex items-baseline gap-2 px-2 pb-1 pt-2 text-xl font-black text-slate-900 dark:text-white sm:px-3">
                {category.name}
                <span className="text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">{category.books.length} 本</span>
              </h2>
              <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5">
                {category.books.map((book, j) => (
                  <BookCard key={book.slug} book={book} eager={i === 0 && j < 2} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
