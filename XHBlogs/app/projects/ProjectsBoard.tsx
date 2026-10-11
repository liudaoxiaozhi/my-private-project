"use client";

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderGit2, Search, SearchX } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { projectsData } from '../../data/projects';

export default function ProjectsBoard() {
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedQuery = searchQuery.trim();

  // 搜索过滤逻辑
  const filteredProjects = useMemo(() => {
    if (trimmedQuery === "") return projectsData;
    const query = trimmedQuery.toLowerCase();

    return projectsData.filter(project =>
      project.name.toLowerCase().includes(query) ||
      project.description.toLowerCase().includes(query) ||
      project.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [trimmedQuery]);

  const hasProjects = projectsData.length > 0;

  return (
    <div className="relative z-10">
      <PageHeader
        back
        icon={<FolderGit2 size={30} />}
        title="项目矩阵"
        subtitle={hasProjects ? `开源项目、科研代码与实验室折腾记录，共 ${projectsData.length} 个。` : '开源项目、科研代码与实验室折腾记录。'}
        actions={
          hasProjects && (
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">搜索项目</span>
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                placeholder="搜索项目名称、描述或技术栈..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-full bg-white/70 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 ring-1 ring-black/5 outline-none transition-shadow focus:ring-2 focus:ring-indigo-400 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:ring-white/10"
              />
            </label>
          )
        }
      />

      {!hasProjects ? (
        <EmptyState
          className="mt-6"
          icon={<FolderGit2 size={30} />}
          title="还没有项目"
          description="在后台「项目」里添加第一个开源项目或代码仓库吧。"
        />
      ) : (
        <motion.div layout className="relative mt-6 grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          <AnimatePresence>
            {filteredProjects.map((project) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                key={project.id}
                className="h-full"
              >
                <a data-glow data-tilt
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-card group relative flex h-full flex-col overflow-hidden p-5 transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:p-7"
                >
                  {/* 装饰性光晕 */}
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl transition-colors duration-500 group-hover:bg-indigo-500/20"></div>

                  <div className="relative z-10 mb-3 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 text-3xl sm:text-4xl" aria-hidden="true">{project.icon}</span>
                      <h2 className="min-w-0 break-words text-xl font-black tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400 sm:text-2xl">
                        {project.name}
                      </h2>
                    </div>
                    {/* GitHub 图标 */}
                    <svg className="mt-1 h-6 w-6 shrink-0 text-slate-400 transition-colors group-hover:text-slate-800 dark:group-hover:text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                  </div>

                  <p className="relative z-10 mb-5 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {project.description}
                  </p>

                  {project.tags.length > 0 && (
                    <div className="relative z-10 mt-auto flex flex-wrap gap-1.5">
                      {project.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </a>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredProjects.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-full"
            >
              <EmptyState
                icon={<SearchX size={30} />}
                title={`没有找到「${trimmedQuery}」相关的项目`}
                description="换个关键词试试，项目名称、描述和技术栈标签都能搜。"
                action={
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
                  >
                    清空搜索
                  </button>
                }
              />
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
