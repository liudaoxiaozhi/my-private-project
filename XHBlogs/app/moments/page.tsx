import type { Metadata } from 'next';
import MomentList from './MomentList';
import { siteConfig } from '../../siteConfig';
import { getAllMoments } from '../../lib/content';

export const metadata: Metadata = {
  title: "说说 | " + siteConfig.title,
  description: "生活动态与瞬间记录",
};

export default function MomentsPage() {
  const allMoments = getAllMoments();

  return (
    <div className="min-h-screen relative pb-10 flex flex-col">
      <div className="flex-1 flex flex-col">
        <MomentList
          moments={allMoments}
          authorName={siteConfig.authorName}
          avatarUrl={siteConfig.avatarUrl}
        />
      </div>
    </div>
  );
}