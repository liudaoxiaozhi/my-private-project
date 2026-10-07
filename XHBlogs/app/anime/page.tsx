// app/anime/page.tsx —— 追番（建设中：之后接入 TMDB，展示在看 / 看过 / 想看的番剧与电影）
import type { Metadata } from 'next';
import { Clapperboard } from 'lucide-react';
import ComingSoon from '../../components/ComingSoon';
import { siteConfig } from '../../siteConfig';

export const metadata: Metadata = { title: `追番 | ${siteConfig.title}`, description: '番剧与电影' };

export default function AnimePage() {
  return <ComingSoon title="追番" description="在看、看过和想看的番剧与电影，正在整理中。" Icon={Clapperboard} />;
}
