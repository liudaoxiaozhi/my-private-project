// app/media/wishlist/page.tsx —— 想看清单：书影音里所有「想看 / 想读 / 想听」的条目，按优先级排好
//
// 和 /media 用同一份数据（data/anime.json）；登录了网页后台时可以直接「开始看」、编辑、移除，访客只能看。
import type { Metadata } from 'next';
import { ToastProvider } from '../../../components/ToastProvider';
import { siteConfig } from '../../../siteConfig';
import { ANIME_EDITABLE, isBangumiLoggedIn, readAnimeList } from '../../../lib/server/animeStore';
import { isTmdbConfigured } from '../../../lib/server/tmdb';
import WishlistClient from './WishlistClient';

export const metadata: Metadata = { title: `想看清单 | ${siteConfig.title}`, description: '想看的影视、想读的书、想听的音乐' };

export default function WishlistPage() {
  // 只传想看的：这一页不新建条目，用不到整个库（开始看 / 编辑后条目在客户端离开清单）
  const entries = readAnimeList().filter((e) => e.status === 'planned');

  return (
    <ToastProvider>
      <div className="relative min-h-screen pb-24">
        <main className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6 md:mt-28 lg:px-8">
          <WishlistClient
            initialEntries={entries}
            editable={ANIME_EDITABLE}
            initialCredentials={{ tmdb: ANIME_EDITABLE && isTmdbConfigured(), bangumi: ANIME_EDITABLE && isBangumiLoggedIn() }}
          />
        </main>
      </div>
    </ToastProvider>
  );
}
