'use client';
// app/anime/AnimeModal.tsx —— 追番页的弹窗外壳：挂到 body 上（页面外层有 transform 动画，fixed 会错位），Esc / 点遮罩关闭
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
  /**
   * 电影片头（components/cinema/MovieOpening）：overlay 画在遮罩之上、面板之下；
   * opening 期间面板仍挂载、仍持有焦点（对话框名称不变），只是看不见也点不到；
   * closing 时遮罩和面板淡出，由调用方稍后真正卸载。
   */
  cinema?: { overlay: ReactNode; opening: boolean; closing: boolean };
}

const PANEL_SHOWN = { opacity: 1, y: 0, scale: 1 };
const PANEL_ENTER = { opacity: 0, y: 24, scale: 0.98 };
const PANEL_HIDDEN = { opacity: 0, y: 18, scale: 0.985 };
const PANEL_EXIT = { opacity: 0, y: 12, scale: 0.98 };

export default function AnimeModal({ title, onClose, children, footer, confirmClose, cinema }: AnimeModalProps) {
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

  const hidden = !!cinema && (cinema.opening || cinema.closing);
  const panelAnimate = cinema?.closing ? PANEL_EXIT : cinema?.opening ? PANEL_HIDDEN : PANEL_SHOWN;
  const panelTransition = cinema?.closing
    ? { duration: 0.25, ease: 'easeIn' as const }
    : cinema
      ? { duration: 0.45, delay: 0.12, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }
      : { duration: 0.22, ease: 'easeOut' as const };

  return createPortal(
    <div
      data-cinema={cinema ? (cinema.closing ? 'closing' : cinema.opening ? 'opening' : 'shown') : undefined}
      className={`fixed inset-0 z-[10000] flex items-end justify-center sm:items-center sm:p-6${cinema ? ' cinema-stage' : ''}`}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: cinema?.closing ? 0 : 1 }}
        transition={{ duration: cinema?.closing ? 0.28 : 0.2 }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => closeRef.current()}
        aria-hidden="true"
      />
      {cinema?.overlay}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        initial={cinema ? PANEL_HIDDEN : PANEL_ENTER}
        animate={panelAnimate}
        transition={panelTransition}
        // 片头 / 退场期间：看不见也点不到，但不用 inert / visibility，焦点仍留在对话框上
        style={hidden ? { pointerEvents: 'none' } : undefined}
        className={`relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/60 bg-white/95 shadow-2xl outline-none dark:border-white/10 dark:bg-slate-900/95 sm:rounded-3xl${cinema ? ' cinema-panel' : ''}`}
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
