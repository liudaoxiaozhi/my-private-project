// app/media/page.tsx —— 书影音：番剧、电影、电视剧、书和音乐，在看 / 想看 / 看过（在读、在听……）都在这里
//
// 数据在 data/anime.json（整个书影音库）。本地开发模式（本地预览.bat / npm run dev）或登录了网页后台时，
// 可以直接在页面上添加和编辑；访客只能看。旧地址 /anime 在 next.config.ts 里永久重定向到这里。
import type { Metadata } from 'next';
import { ToastProvider } from '../../components/ToastProvider';
import { siteConfig } from '../../siteConfig';
import { ANIME_EDITABLE, isBangumiLoggedIn, readAnimeList } from '../../lib/server/animeStore';
import { isTmdbConfigured } from '../../lib/server/tmdb';
import MediaClient from './MediaClient';

export const metadata: Metadata = { title: `书影音 | ${siteConfig.title}`, description: '读过的书、看过的番剧与电影、听过的音乐，还有想看清单' };

export default function MediaPage() {
  const entries = readAnimeList();

  return (
    <ToastProvider>
      <div className="relative min-h-screen pb-24">
        <main className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6 md:mt-28 lg:px-8">
          <MediaClient
            initialEntries={entries}
            editable={ANIME_EDITABLE}
            initialCredentials={{ tmdb: ANIME_EDITABLE && isTmdbConfigured(), bangumi: ANIME_EDITABLE && isBangumiLoggedIn() }}
          />
        </main>
      </div>
    </ToastProvider>
  );
}
