'use client';
// app/media/AnimeModal.tsx —— 书影音页的弹窗外壳：挂到 body 上（页面外层有 transform 动画，fixed 会错位），Esc / 点遮罩关闭
// 层级要压过桌宠、播放器等全站浮层（z-9999）；提示条（ToastProvider）在它之上
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface AnimeModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 有未保存内容时关闭前确认 */
  confirmClose?: () => boolean;
}

export default function AnimeModal({ title, onClose, children, footer, confirmClose }: AnimeModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 回调放进 ref，键盘监听只需注册一次
  const closeRef = useRef(() => {});
  useEffect(() => {
    closeRef.current = () => {
      if (!confirmClose || confirmClose()) onClose();
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => closeRef.current()}
        aria-hidden="true"
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/60 bg-white/95 shadow-2xl outline-none dark:border-white/10 dark:bg-slate-900/95 sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-4 dark:border-white/10">
          <h2 className="truncate text-lg font-black text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={() => closeRef.current()}
            aria-label="关闭"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200/70 px-5 py-3.5 dark:border-white/10">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
