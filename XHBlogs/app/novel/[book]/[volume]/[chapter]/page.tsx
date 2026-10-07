// app/novel/[book]/[volume]/[chapter]/page.tsx —— 小说章节页（构建时静态生成），交给沉浸式阅读器渲染
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import NovelReader from '../../../../../components/novel/NovelReader';
import { siteConfig } from '../../../../../siteConfig';
import { formatDisplayDate, toPlainText } from '../../../../../lib/content';
import { renderMarkdown } from '../../../../../lib/markdown';
import { bookHref, chapterHref, getAllChapters, getBook, getChapter, getNeighbors } from '../../../../../lib/novel';

interface ChapterParams {
  book: string;
  volume: string;
  chapter: string;
}

interface ChapterPageProps {
  params: Promise<ChapterParams>;
}

export function generateStaticParams(): ChapterParams[] {
  return getAllChapters().map((c) => ({ book: c.bookSlug, volume: c.volumeSlug, chapter: c.chapterSlug }));
}

/** 只认构建时存在的章节，其他路径 404 */
export const dynamicParams = false;

export async function generateMetadata({ params }: ChapterPageProps): Promise<Metadata> {
  const { book: bookSlug, volume, chapter } = await params;
  const book = getBook(bookSlug);
  const data = getChapter(bookSlug, volume, chapter);
  if (!book || !data) return { title: `章节不存在 | ${siteConfig.title}` };
  const description = toPlainText(data.content).slice(0, 120);
  return {
    title: `${data.title} · ${book.title} | ${siteConfig.title}`,
    description,
    alternates: { canonical: chapterHref(data) },
    openGraph: {
      type: 'article',
      title: `${data.title} · ${book.title}`,
      description,
      siteName: siteConfig.title,
      locale: 'zh_CN',
      images: book.cover ? [{ url: book.cover, alt: book.title }] : undefined,
    },
  };
}

export default async function ChapterPage({ params }: ChapterPageProps) {
  const { book: bookSlug, volume, chapter } = await params;
  const book = getBook(bookSlug);
  const data = getChapter(bookSlug, volume, chapter);
  if (!book || !data) notFound();

  const { prev, next, position, total } = getNeighbors(bookSlug, volume, chapter);
  const toLink = (c: typeof prev) => (c ? { href: chapterHref(c), title: c.title } : null);

  return (
    <NovelReader
      bookSlug={book.slug}
      bookTitle={book.title}
      bookHref={bookHref(book.slug)}
      volumeTitle={data.volumeTitle}
      chapterTitle={data.title}
      dateText={data.date ? formatDisplayDate(data.date) : ''}
      wordCount={data.wordCount}
      html={await renderMarkdown(data.content)}
      href={chapterHref(data)}
      prev={toLink(prev)}
      next={toLink(next)}
      position={position}
      total={total}
      isOngoing={book.status === '连载中'}
    />
  );
}
