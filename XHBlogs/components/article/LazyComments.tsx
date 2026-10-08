"use client";
// components/article/LazyComments.tsx —— 评论区延迟加载
//
// Gitalk 脚本和样式不小，读者滚到评论区附近才加载；
// 从 GitHub 登录回来（地址带 ?code=）时立即加载，让 Gitalk 完成登录。

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';

const Comments = dynamic(() => import('../Comments'), { ssr: false, loading: () => <CommentsPlaceholder /> });

const PRELOAD_MARGIN = '600px 0px';

const subscribeNone = () => () => {};

/** Gitalk 登录完成后会把 ?code= 从地址栏擦掉，所以记住是在哪个页面看到的，之后重渲染也保持加载 */
let loginReturnPath: string | null = null;
const isReturningFromLogin = (): boolean => {
  if (new URLSearchParams(window.location.search).has('code')) loginReturnPath = window.location.pathname;
  return loginReturnPath === window.location.pathname;
};

function CommentsPlaceholder() {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-3xl border border-dashed border-slate-300/70 text-sm text-slate-400 dark:border-slate-700">
      评论区加载中…
    </div>
  );
}

export default function LazyComments() {
  const ref = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const returningFromLogin = useSyncExternalStore(subscribeNone, isReturningFromLogin, () => false);
  const visible = nearby || returningFromLogin;

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={ref}>{visible ? <Comments /> : <CommentsPlaceholder />}</div>;
}
