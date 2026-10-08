"use client";
// components/article/ArticleEnhancer.tsx —— 给服务端渲染好的正文 HTML 加上交互
//
// 正文由服务端组件直接输出（不经过客户端组件，避免整篇 HTML 在页面里存两份），
// 这里只在正文容器上挂事件代理：
//   代码块复制 / 展开、黑幕点击显示、标题锚点复制链接、脚注悬停预览（手机上点击预览）、图片点击放大

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ARTICLE_CONTENT_ID } from '../../lib/articleReader';
import { useIsClient } from '../../lib/useIsClient';

interface LightboxImage {
  src: string;
  alt: string;
}

interface FootnotePreview {
  html: string;
  left: number;
  /** 显示在角标下方时用 top，上方时用 bottom（都是相对视口） */
  top?: number;
  bottom?: number;
}

const FEEDBACK_MS = 1600;
const FOOTNOTE_SHOW_DELAY = 120;
const FOOTNOTE_HIDE_DELAY = 220;
const POPOVER_WIDTH = 352;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非 https 或旧浏览器：退回到 execCommand
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}

/** 取代码块的纯文本：删除行（diff 的 -）不复制，行号由 CSS 生成本来就不在文本里 */
function codeTextOf(block: Element): string {
  const lines = Array.from(block.querySelectorAll('pre code .line'));
  if (lines.length === 0) return block.querySelector('pre')?.textContent ?? '';
  return lines
    .filter((line) => !line.classList.contains('remove'))
    .map((line) => line.textContent ?? '')
    .join('\n');
}

function flash(el: HTMLElement, attr: string, value: string, restore?: () => void): void {
  el.setAttribute(attr, value);
  window.setTimeout(() => {
    el.removeAttribute(attr);
    restore?.();
  }, FEEDBACK_MS);
}

function footnoteHtml(ref: HTMLAnchorElement): string | null {
  const id = decodeURIComponent(ref.hash.slice(1));
  const item = id ? document.getElementById(id) : null;
  if (!item) return null;
  const clone = item.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-footnote-backref]').forEach((a) => a.remove());
  return clone.innerHTML.trim();
}

function placePopover(ref: HTMLElement): Omit<FootnotePreview, 'html'> {
  const rect = ref.getBoundingClientRect();
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - 32);
  const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16);
  const below = rect.bottom + 220 < window.innerHeight || rect.top < 220;
  return below ? { top: rect.bottom + 8, left } : { bottom: window.innerHeight - rect.top + 8, left };
}

export default function ArticleEnhancer({ contentId = ARTICLE_CONTENT_ID }: { contentId?: string }) {
  const mounted = useIsClient();
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [footnote, setFootnote] = useState<FootnotePreview | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  const hideFootnote = useCallback((delay = 0) => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setFootnote(null), delay);
  }, []);

  const showFootnote = useCallback((ref: HTMLAnchorElement, delay: number) => {
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => {
      const html = footnoteHtml(ref);
      if (html) setFootnote({ html, ...placePopover(ref) });
    }, delay);
  }, []);

  useEffect(() => {
    const root = document.getElementById(contentId);
    if (!root) return;

    // 链接里的图片保留跳转，其余图片可点击放大
    const zoomable = Array.from(root.querySelectorAll<HTMLImageElement>('img')).filter((img) => !img.closest('a'));
    zoomable.forEach((img, i) => {
      img.dataset.zoomable = String(i);
    });
    const lightboxImages = (): LightboxImage[] =>
      zoomable.map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.closest('figure')?.querySelector('figcaption')?.textContent || img.alt,
      }));

    const hoverCapable = window.matchMedia('(hover: hover)');

    const toggleSpoiler = (spoiler: HTMLElement) => {
      const revealed = spoiler.classList.toggle('is-revealed');
      spoiler.setAttribute('aria-pressed', String(revealed));
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const copyBtn = target.closest<HTMLButtonElement>('.code-copy');
      if (copyBtn) {
        const block = copyBtn.closest('.code-block');
        if (!block) return;
        void copyText(codeTextOf(block)).then((ok) => {
          copyBtn.textContent = ok ? '已复制' : '复制失败';
          flash(copyBtn, 'data-state', ok ? 'copied' : 'failed', () => {
            copyBtn.textContent = '复制';
          });
        });
        return;
      }

      const expandBtn = target.closest<HTMLButtonElement>('.code-expand');
      if (expandBtn) {
        const block = expandBtn.closest<HTMLElement>('.code-block');
        if (!block) return;
        const collapsed = block.classList.toggle('is-collapsed');
        expandBtn.setAttribute('aria-expanded', String(!collapsed));
        expandBtn.textContent = collapsed ? `展开全部 ${expandBtn.dataset.lines ?? ''} 行` : '收起代码';
        // 收起后如果代码块顶部已经滚出屏幕，滚回代码块开头，免得读者迷路
        if (collapsed && block.getBoundingClientRect().top < 0) block.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }

      const spoiler = target.closest<HTMLElement>('.spoiler');
      if (spoiler) {
        toggleSpoiler(spoiler);
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>('.heading-anchor');
      if (anchor) {
        e.preventDefault();
        const heading = anchor.parentElement;
        history.replaceState(null, '', anchor.hash);
        heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        void copyText(window.location.href).then((ok) => {
          if (ok) flash(anchor, 'data-copied', '');
        });
        return;
      }

      const ref = target.closest<HTMLAnchorElement>('a[data-footnote-ref]');
      if (ref && !hoverCapable.matches) {
        // 触屏：点击角标就地预览，不跳到文末
        e.preventDefault();
        showFootnote(ref, 0);
        return;
      }

      const img = target.closest<HTMLImageElement>('img[data-zoomable]');
      if (img) {
        setLightbox({ images: lightboxImages(), index: Number(img.dataset.zoomable) });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const spoiler = (e.target as HTMLElement).closest?.<HTMLElement>('.spoiler');
      if (spoiler && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleSpoiler(spoiler);
      }
    };

    const onOver = (e: MouseEvent) => {
      if (!hoverCapable.matches) return;
      const ref = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-footnote-ref]');
      if (ref) showFootnote(ref, FOOTNOTE_SHOW_DELAY);
    };
    const onOut = (e: MouseEvent) => {
      if (!hoverCapable.matches) return;
      if ((e.target as HTMLElement).closest('a[data-footnote-ref]')) hideFootnote(FOOTNOTE_HIDE_DELAY);
    };
    const onFocusIn = (e: FocusEvent) => {
      const ref = (e.target as HTMLElement).closest?.<HTMLAnchorElement>('a[data-footnote-ref]');
      if (ref) showFootnote(ref, 0);
    };
    const onFocusOut = (e: FocusEvent) => {
      if ((e.target as HTMLElement).closest?.('a[data-footnote-ref]')) hideFootnote(FOOTNOTE_HIDE_DELAY);
    };

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseout', onOut);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('mouseout', onOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
    };
  }, [contentId, showFootnote, hideFootnote]);

  // 脚注预览打开时：滚动、点别处、按 Esc 都关闭
  useEffect(() => {
    if (!footnote) return;
    const close = () => hideFootnote(0);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.xh-footnote-popover') && !target.closest('a[data-footnote-ref]')) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('scroll', close, { passive: true });
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [footnote, hideFootnote]);

  if (!mounted) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {footnote && (
          <motion.div
            key="footnote"
            role="tooltip"
            className="glass-float rounded-2xl xh-footnote-popover fixed z-[10000] px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200 [&_a]:text-indigo-500 [&_a]:underline [&_code]:rounded [&_code]:bg-indigo-500/10 [&_code]:px-1 [&_p]:m-0"
            style={{
              top: footnote.top,
              bottom: footnote.bottom,
              left: footnote.left,
              width: `min(${POPOVER_WIDTH}px, calc(100vw - 32px))`,
            }}
            initial={{ opacity: 0, y: footnote.bottom !== undefined ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={() => window.clearTimeout(hideTimer.current)}
            onMouseLeave={() => hideFootnote(FOOTNOTE_HIDE_DELAY)}
          >
            <div className="mb-1 text-[11px] font-black tracking-widest text-indigo-500">脚注</div>
            <div dangerouslySetInnerHTML={{ __html: footnote.html }} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lightbox && lightbox.images[lightbox.index] && (
          <Lightbox
            key="lightbox"
            images={lightbox.images}
            index={lightbox.index}
            onIndexChange={(index) => setLightbox({ ...lightbox, index })}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}

interface LightboxProps {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const image = images[index];
  const many = images.length > 1;
  const go = useCallback(
    (step: number) => onIndexChange((index + step + images.length) % images.length),
    [index, images.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (many && e.key === 'ArrowLeft') go(-1);
      else if (many && e.key === 'ArrowRight') go(1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [go, many, onClose]);

  // 手机上左右滑动切换
  const touchX = useRef<number | null>(null);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null || !many) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx > 0 ? -1 : 1);
      }}
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X size={22} />
      </button>

      {many && (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:flex"
          >
            <ChevronLeft size={26} />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:flex"
          >
            <ChevronRight size={26} />
          </button>
        </>
      )}

      <motion.img
        key={image.src}
        src={image.src}
        alt={image.alt}
        className="max-h-[82vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      />

      {(image.alt || many) && (
        <p className="mt-4 max-w-[92vw] text-center text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
          {image.alt}
          {many && <span className="ml-2 text-white/50 tabular-nums">{index + 1} / {images.length}</span>}
        </p>
      )}
    </motion.div>
  );
}
