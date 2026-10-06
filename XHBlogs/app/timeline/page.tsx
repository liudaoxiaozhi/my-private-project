import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { siteConfig } from '../../siteConfig';
import TimelineClient from '../../components/TimelineClient';
// 🌟 1. 引入 ToastProvider 喵！
import { ToastProvider } from '../../components/ToastProvider';
import { getAllPosts, getTagStats } from '../../lib/content';

export const metadata: Metadata = {
  title: "归档与探索 | " + siteConfig.title,
};

export default function Timeline() {
  const allPosts = getAllPosts();
  const posts = allPosts.map((post) => ({
    ...post,
    tags: post.tags.length > 0 ? post.tags : ['未分类'],
    cover: post.cover || siteConfig.defaultPostCover,
  }));
  const tagsArray = getTagStats(allPosts);

  return (
    // 🌟 2. 在最外层用 ToastProvider 包裹整个页面
    <ToastProvider>
      <div className="min-h-screen relative pb-32">
        <Navbar />
        <PageTransition>
          <TimelineClient posts={posts} tags={tagsArray} />
        </PageTransition>
      </div>
    </ToastProvider>
  );
}