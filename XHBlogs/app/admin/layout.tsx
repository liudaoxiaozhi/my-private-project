// app/admin/layout.tsx —— 网页后台：不让搜索引擎收录；正文预览要用文章样式
import type { Metadata } from 'next';
import '../article.css';

export const metadata: Metadata = {
  title: 'XHBlogs 控制台',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
