// app/novel/epub/page.tsx —— 本地 EPUB 阅读器（读者选择自己设备上的文件，在浏览器里阅读，不上传）
// 静态段 epub 优先于动态段 [book]，书架里不要建名为 epub 的书文件夹。
import type { Metadata } from 'next';
import EpubReader from '../../../components/novel/EpubReader';
import { siteConfig } from '../../../siteConfig';

export const metadata: Metadata = {
  title: `本地 EPUB 阅读器 | ${siteConfig.title}`,
  description: '在浏览器里打开你自己的 EPUB 电子书，文件不会上传',
  robots: { index: false },
};

export default function EpubReaderPage() {
  return <EpubReader />;
}
