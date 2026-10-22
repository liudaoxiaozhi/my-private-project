// components/ComingSoon.tsx —— 尚在建设中的栏目占位页（Server Component）
import type { LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
  Icon: LucideIcon;
}

export default function ComingSoon({ title, description, Icon }: ComingSoonProps) {
  return (
    <div className="relative min-h-screen pb-24">
      <main className="relative z-10 mx-auto mt-8 w-full max-w-3xl px-4 sm:px-6 md:mt-28">
        <section className="glass-card flex flex-col items-center px-6 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
            <Icon size={30} />
          </span>
          <h1 className="mt-5 text-3xl font-black text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
          <p className="mt-6 rounded-full bg-white/60 px-4 py-1.5 text-xs font-bold tracking-widest text-slate-500 ring-1 ring-white/50 dark:bg-slate-900/40 dark:text-slate-400 dark:ring-white/10">
            建设中 · 敬请期待
          </p>
        </section>
      </main>
    </div>
  );
}
