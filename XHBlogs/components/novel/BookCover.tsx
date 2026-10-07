// components/novel/BookCover.tsx —— 书封（3:4）。没有封面图时显示书名竖排的渐变书封
// 不加 'use client'：书架与书页（Server Component）直接使用。
import AppImage from '../AppImage';
import type { NovelBook } from '../../lib/novel';

interface BookCoverProps {
  book: Pick<NovelBook, 'title' | 'cover'>;
  /** next/image 的 sizes */
  sizes: string;
  /** 首屏封面传 true */
  eager?: boolean;
  className?: string;
  /** 无封面时书名的字号 */
  titleClassName?: string;
}

export default function BookCover({ book, sizes, eager = false, className = '', titleClassName = 'text-2xl' }: BookCoverProps) {
  return (
    <div className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-200 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] dark:bg-slate-700 ${className}`}>
      {book.cover ? (
        <AppImage src={book.cover} alt={`${book.title} 封面`} fill sizes={sizes} loading={eager ? 'eager' : 'lazy'} className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
          <span className={`font-black leading-snug text-white [writing-mode:vertical-rl] [text-orientation:upright] drop-shadow ${titleClassName}`}>
            {book.title}
          </span>
        </div>
      )}
    </div>
  );
}
