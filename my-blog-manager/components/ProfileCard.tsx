"use client";

import { useRouter } from 'next/navigation';
import { siteConfig } from '../siteConfig';
import { useToast } from './ToastProvider';
import SocialLinks from './SocialLinks'; // 👈 引入我们写好的绝美提示钩子

export default function ProfileCard({ postCount, chatterCount, photoCount }: { postCount: number, chatterCount: number, photoCount: number }) {
  const router = useRouter();
  const { showToast } = useToast(); // 👈 激活魔法


  return (
    <div
      onClick={() => router.push('/about')}
      className="md:col-span-7 rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl p-8 flex flex-col justify-between transition-all duration-700 hover:scale-[1.01] cursor-pointer group relative overflow-hidden h-full min-h-[280px]"
    >
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 p-1 shadow-lg flex-shrink-0 transition-transform duration-500 group-hover:rotate-3">
            <img src={siteConfig.avatarUrl} alt="avatar" className="w-full h-full rounded-xl object-cover bg-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-wider transition-colors duration-700">{siteConfig.authorName}</h1>
            <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed max-w-md transition-colors duration-700">{siteConfig.bio}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-end md:items-center justify-between mt-8 gap-6 relative z-10">
        {/* 数据统计区 */}
        <div className="flex gap-6 w-full md:w-auto justify-around md:justify-start">
          <StatItem count={postCount} label="文章" color="text-indigo-600 dark:text-indigo-400" />
          <div className="w-px h-10 bg-slate-300/50 dark:bg-slate-700 hidden md:block"></div>
          <StatItem count={chatterCount} label="杂谈" color="text-purple-600 dark:text-purple-400" />
          <div className="w-px h-10 bg-slate-300/50 dark:bg-slate-700 hidden md:block"></div>
          <StatItem count={photoCount} label="照片" color="text-pink-600 dark:text-pink-400" />
        </div>

        {/* 社交图标区 - 组件内部已阻止冒泡，防止触发卡片跳转 */}
        <SocialLinks
          size="md"
          className="justify-end"
          onCopied={(label, value) => showToast(`✨ ${label}已复制到剪贴板: ${value}`, 'success')}
        />
      </div>
    </div>
  );
}

function StatItem({ count, label, color }: { count: number, label: string, color: string }) {
  return (
    <div className="text-center group/stat">
      <div className={`text-2xl font-black ${color} transition-transform group-hover/stat:scale-110`}>{count}</div>
      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</div>
    </div>
  );
}
