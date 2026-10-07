// app/anime/page.tsx —— 追番：在看 / 想看 / 看过 / 搁置的番剧、电影与电视剧
//
// 数据在 data/anime.json。本地开发模式（本地预览.bat / npm run dev）下可以直接在页面上添加和编辑，
// 线上与正式模式只展示。
import type { Metadata } from 'next';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { ToastProvider } from '../../components/ToastProvider';
import { siteConfig } from '../../siteConfig';
import { ANIME_EDITABLE, isBangumiLoggedIn, readAnimeList } from '../../lib/server/animeStore';
import { isTmdbConfigured } from '../../lib/server/tmdb';
import AnimeClient from './AnimeClient';

export const metadata: Metadata = { title: `追番 | ${siteConfig.title}`, description: '在看、想看和看过的番剧与电影' };

export default function AnimePage() {
  const entries = readAnimeList();

  return (
    <ToastProvider>
      <div className="relative min-h-screen pb-24">
        <Navbar />
        <PageTransition>
          <main className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6 md:mt-28 lg:px-8">
            <AnimeClient
              initialEntries={entries}
              editable={ANIME_EDITABLE}
              initialCredentials={{ tmdb: ANIME_EDITABLE && isTmdbConfigured(), bangumi: ANIME_EDITABLE && isBangumiLoggedIn() }}
            />
          </main>
        </PageTransition>
      </div>
    </ToastProvider>
  );
}
