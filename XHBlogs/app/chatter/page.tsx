import type { Metadata } from 'next';
import ChatterBoard from './ChatterBoard';
import { siteConfig } from '@/siteConfig';
import { getAllChatters } from '@/lib/content';


export const metadata: Metadata = {
  title: "杂谈 | "+ siteConfig.title,
  description: "日常碎片与灵感记录",
};

export default function ChatterPage() {
  const chatters = getAllChatters().map((chatter) => ({
    slug: chatter.slug,
    title: chatter.title,
    date: chatter.date || '未知时间',
    tags: chatter.tags,
    mood: chatter.mood,
    cover: chatter.cover,
    // 去除开头的 Markdown 标题，卡片预览更干净
    content: chatter.content.replace(/^#+ .*\n/m, ''),
  }));

  return (
    <div className="min-h-screen relative pb-10">
      {/* 将解析好的数据传递给客户端组件进行瀑布流渲染 */}
      <ChatterBoard chatters={chatters} />
    </div>
  );
}