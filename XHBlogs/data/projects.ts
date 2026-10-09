// data/projects.ts —— 项目展示。内容在 projects.json 里，后台「项目」改的就是那个文件
import data from './projects.json';

export type Project = {
  id: string;
  name: string;
  description: string;
  icon: string;
  githubUrl: string;
  tags: string[];
};

export const projectsData: Project[] = data;
