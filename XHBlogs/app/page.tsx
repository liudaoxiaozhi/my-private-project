import Link from 'next/link';
import { Images } from 'lucide-react';

import SearchBar from '../components/SearchBar';
import { siteConfig } from '../siteConfig';
import CloudPlayer from '../components/CloudPlayer';
import ThemeToggleBlock from '../components/ThemeToggleBlock';
import ProfileCard from '../components/ProfileCard';
import SiteDashboard from '../components/SiteDashboard';
import { albums } from '../data/albums';
import LyricBar from '../components/LyricBar';
import { ToastProvider } from '../components/ToastProvider';

import LatestPostsCarousel from '../components/LatestPostsCarousel';
import LatestChatterCarousel from '../components/LatestChatterCarousel';
import { formatDisplayDate, getAllChatters, getAllPosts } from '../lib/content';
import type { CardItem } from '../lib/content';
import AppImage from '../components/AppImage';
import HomeHero from '../components/HomeHero';

const DEFAULT_CHATTER_COVER = siteConfig.defaultChatterCover || siteConfig.defaultPostCover;

export default function Home() {
  // 只含摘要，不含正文：旧版把所有文章全文一并传给 SearchBar，整站正文都被塞进首页 HTML
  const allPosts = getAllPosts();
  const allChatters = getAllChatters();

  const top5Posts: CardItem[] = allPosts.length > 0
    ? allPosts.slice(0, 5).map((post) => ({
        slug: post.slug,
        title: post.title,
        description: post.description,
        cover: post.cover || siteConfig.defaultPostCover,
        date: post.date,
        formattedDate: formatDisplayDate(post.date),
      }))
    : [{ slug: 'none', title: '暂无文章', description: '快去写第一篇吧！', cover: siteConfig.defaultPostCover, date: '', formattedDate: '' }];

  const top5Chatters: CardItem[] = allChatters.length > 0
    ? allChatters.slice(0, 5).map((chatter) => ({
        slug: chatter.slug,
        title: chatter.title || '碎片记录',
        description: chatter.excerpt,
        cover: chatter.cover || DEFAULT_CHATTER_COVER,
        date: chatter.date,
        formattedDate: formatDisplayDate(chatter.date),
      }))
    : [{ slug: 'none', title: '暂无记录', description: '记录一段思绪...', cover: DEFAULT_CHATTER_COVER, date: '', formattedDate: '' }];

  // 开场弹幕：配置里的句子 + 最近几篇文章的标题
  const danmaku = [...(siteConfig.danmakuList ?? []), ...allPosts.slice(0, 4).map((post) => `新文章《${post.title}》`)];

  const chatterCount = allChatters.length;
  const realPhotoCount = albums.reduce((total, album) => total + album.photos.length, 0);
  const latestAlbum = albums.length > 0 ? albums[0] : { id: '', title: '照片墙', description: '查看摄影', cover: siteConfig.photoWallImage, date: '' };

  return (
    <ToastProvider>
      <div className="min-h-screen relative pb-10">
        {/* 开场：一屏高的大标题（siteConfig.homeHero），往下滚才是卡片区 */}
        {siteConfig.homeHero?.enabled && <HomeHero danmaku={danmaku} />}

        {/* 🌟 调整整体容器的内边距，适应手机端更小的屏幕；scroll-mt 让「往下滚」停在导航栏下面 */}
        <div id="home-main" className={`w-full max-w-6xl mx-auto ${siteConfig.homeHero?.enabled ? 'mt-0 scroll-mt-24' : 'mt-8 md:mt-28'} px-4 sm:px-6 lg:px-10 relative z-10`}>
          <SearchBar posts={allPosts} />

          <main className="flex flex-col gap-6 w-full mt-6">

            {/* 第一行：个人信息 + 播放器 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
              {/* 手机上占满1列，电脑上占7列 */}
              <div className="col-span-1 lg:col-span-7 flex flex-col">
                  <ProfileCard postCount={allPosts.length} chatterCount={chatterCount} photoCount={realPhotoCount}/>
              </div>
              {/* 手机上占满1列，电脑上占5列 */}
              <div className="col-span-1 lg:col-span-5 flex flex-col">
                  <CloudPlayer/>
              </div>
            </div>

            {/* 歌词栏（没有歌曲时整块不渲染，不会多出一道空隙） */}
            <LyricBar/>

            {/* 第二行：文章轮播 + 照片墙 + 说说 + 主题切换 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">

              {/* 左侧：文章轮播 (电脑端占4列，手机端排最上面) */}
              <div className="col-span-1 lg:col-span-4 flex flex-col">
                <LatestPostsCarousel posts={top5Posts} />
              </div>

              {/* 右侧：组合面板 (电脑端占8列) */}
              <div className="col-span-1 lg:col-span-8 flex flex-col gap-6">

                {/* 照片墙大海报：左上角是和其他卡片一致的小标题，左下角是最新相册 */}
                <Link data-glow href="/photowall" className="glass-card group relative flex w-full min-h-[200px] flex-shrink-0 flex-col justify-between overflow-hidden p-5 transition-all duration-700 hover:scale-[1.02] sm:min-h-[220px] sm:p-6">
                  <AppImage src={latestAlbum.cover} alt={latestAlbum.title} fill sizes="(min-width: 1024px) 750px, 100vw" className="w-full h-full absolute inset-0 object-cover transition-transform duration-700 group-hover:scale-105 opacity-90" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/40 transition-opacity duration-500 group-hover:opacity-80 dark:from-black/80 dark:via-black/30 dark:to-black/50"></div>
                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-white drop-shadow-sm">
                      <Images className="h-4 w-4 text-indigo-300" aria-hidden="true" />
                      照片墙
                    </h2>
                    {realPhotoCount > 0 && <span className="text-xs font-medium text-white/75 tabular-nums drop-shadow-sm">{realPhotoCount} 张</span>}
                  </div>
                  <div className="relative z-10 pt-6">
                    <h3 className="line-clamp-1 text-xl font-bold text-white drop-shadow-md sm:text-2xl">{latestAlbum.title}</h3>
                    <p className="mt-1 line-clamp-1 text-sm text-white/75 drop-shadow-sm">{latestAlbum.description}</p>
                  </div>
                </Link>

                {/* 底层网格：说说轮播 + 主题切换器 */}
                {/* 手机上单列，平板上分3列比例分布 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full flex-1">
                  <div className="sm:col-span-2 flex flex-col min-h-[200px]">
                    <LatestChatterCarousel chatters={top5Chatters} />
                  </div>
                  <div className="sm:col-span-1 flex flex-col min-h-[120px]">
                    <ThemeToggleBlock />
                  </div>
                </div>

              </div>
            </div>

            {/* 底部数据面板 */}
            <SiteDashboard/>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}