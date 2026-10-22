// app/novel/page.tsx —— 书架：按分类展示所有书（可在线阅读的书 + 书单条目）
//
// 每个分类一块毛玻璃面板，面板里的书卡本身不再叠加 backdrop-blur，避免多层模糊拖慢滚动。
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Library } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import PageHeader from '../../components/PageHeader';
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

/** 和 FilterChip 未选中时一个样子，只是换成页内锚点链接 */
const SHELF_CHIP =
  'inline-flex items-center gap-1.5 rounded-full bg-white/60 px-4 py-1.5 text-sm font-bold text-slate-600 transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/70';

function BookCard({ book, eager }: { book: BookSummary; eager: boolean }) {
  return (
    <li data-reveal>
      <Link data-glow data-tilt
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
      <main className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6 md:mt-28 lg:px-8">
        <PageHeader
          title="书架"
          icon={<Library size={30} />}
          subtitle={books.length > 0 ? `共 ${books.length} 本，其中 ${readableCount} 本可以在站内阅读` : '书架还是空的'}
          actions={
            <Link
              href="/novel/epub"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
              title="在浏览器里打开你自己的 EPUB 文件，不会上传"
            >
              <BookOpen size={16} /> 打开本地 EPUB
            </Link>
          }
        >
          {shelf.length > 1 && (
            // 分类是页内跳转链接，不是切换筛选，所以不用 FilterChip（它是带 onClick 的 button，服务端组件里也传不了函数）；
            // 样式照抄 FilterChip 未选中的样子
            <nav aria-label="分类" className="flex flex-wrap gap-2">
              {shelf.map((category, i) => (
                <a key={category.name} href={`#shelf-${i}`} className={SHELF_CHIP}>
                  {category.name}
                  <span className="text-xs tabular-nums text-slate-400">{category.books.length}</span>
                </a>
              ))}
            </nav>
          )}
        </PageHeader>

        {books.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={<Library size={28} />}
            title="书架还是空的"
            description={
              <>
                按 <code className="rounded bg-black/5 px-1.5 py-0.5 dark:bg-white/10">novel/README.md</code> 里的格式放进第一本书吧。
              </>
            }
          />
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
