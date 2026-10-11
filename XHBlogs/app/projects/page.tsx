import ProjectsBoard from './ProjectsBoard';
import {siteConfig} from "@/siteConfig";

export const metadata = {
  title: "项目矩阵 | " + siteConfig.title,
  description: "开源项目与代码仓库展示",
};

export default function ProjectsPage() {
  return (
    <div className="relative min-h-screen pb-24">
      <main className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
        <ProjectsBoard />
      </main>
    </div>
  );
}
