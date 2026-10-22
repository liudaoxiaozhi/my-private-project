import FriendsBoard from './FriendsBoard';
import {siteConfig} from "@/siteConfig";

export const metadata = {
  title: "友链 | " + siteConfig.title,
  description: "赛博空间里的有趣灵魂",
};

export default function FriendsPage() {
  return (
    <div className="relative min-h-screen pb-24">
      <main className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-4 md:mt-28 sm:px-6">
        <FriendsBoard />
      </main>
    </div>
  );
}
