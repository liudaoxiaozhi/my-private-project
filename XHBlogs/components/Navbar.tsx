"use client";

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, PanInfo } from 'framer-motion';
import { ChevronDown, Search, X } from 'lucide-react';
import { siteConfig } from '../siteConfig';
import { ALL_NAV_LINKS, NAV_ITEMS, isGroup, matchPath } from '../lib/navigation';
import type { NavGroup, NavLink } from '../lib/navigation';
import { openCommandPalette, useModKeyLabel } from '../lib/commandPalette';

/** 手机轮盘里的「搜索」不是页面，点了打开命令面板 */
const SEARCH_HREF = '#search';

/** PC 端「我的」下拉菜单：悬停或点击展开，Esc / 点外面 / 选中后收起 */
function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const active = group.children.some((c) => matchPath(pathname, c.href));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openNow = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // 鼠标移向菜单途中会短暂离开按钮，稍等再关
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  return (
    <div ref={rootRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="nav-dropdown-mine"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-0.5 py-1 font-bold transition-colors ${active || open ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200 hover:text-indigo-600'}`}
      >
        {group.name}
        <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id="nav-dropdown-mine"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            // 导航栏本身有毛玻璃，嵌套的 backdrop-filter 模糊不到页面，所以这里用接近不透明的底色
            className="absolute left-1/2 top-full mt-3 w-52 -translate-x-1/2 origin-top rounded-2xl border border-white/60 bg-white/95 p-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900/95"
          >
            {group.children.map(({ name, href, Icon, hint }) => {
              const isActive = matchPath(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 ${isActive ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5'}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{name}</span>
                      <span className="block truncate text-[11px] font-medium text-slate-400 dark:text-slate-500">{hint}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const [showNav, setShowNav] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // --- 🌟 物理引擎：菜单转动逻辑 ---
  const wheelRef = useRef<HTMLDivElement>(null);
  const rawRotation = useMotionValue(0);
  const smoothRotation = useSpring(rawRotation, { stiffness: 200, damping: 25 });
  const inverseRotation = useTransform(smoothRotation, (r) => -r);

  const handlePan = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const currX = info.point.x;
    const currY = info.point.y;
    const prevX = currX - info.delta.x;
    const prevY = currY - info.delta.y;
    const prevAngle = Math.atan2(prevY - centerY, prevX - centerX);
    const currAngle = Math.atan2(currY - centerY, currX - centerX);
    let deltaAngle = (currAngle - prevAngle) * (180 / Math.PI);
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;
    rawRotation.set(rawRotation.get() + deltaAngle);
  };

  // --- 🌟 物理引擎：手机端按钮拖拽逻辑 ---
  const dragY = useMotionValue(0);
  // 拖动范围：上下各留 80px。约束值不进 DOM，服务端给 0、客户端首帧直接算好，不会有水合差异
  const [constraints] = useState(() => {
    if (typeof window === 'undefined') return { top: 0, bottom: 0 };
    const half = window.innerHeight / 2;
    return { top: -half + 80, bottom: half - 80 };
  });

  useEffect(() => {
    if (isMobileMenuOpen) rawRotation.set(0);
  }, [isMobileMenuOpen, rawRotation]);

  // 控制 PC 端导航栏：上次滚动位置放在 ref 里，只有显隐真正变化时才更新状态
  // （旧版每个滚动事件都 setState，导致整个导航栏随滚动不停重渲染）
  const lastScrollY = useRef(0);
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const next = !(currentScrollY > lastScrollY.current && currentScrollY > 80);
      lastScrollY.current = currentScrollY;
      setShowNav((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 🌟 手机端轮盘：平铺所有页面，最后加一个「搜索」打开 ⌘K 命令面板；圆盘按数量自动均匀排布
  const mobileNavLinks: NavLink[] = [...ALL_NAV_LINKS, { name: '搜索', href: SEARCH_HREF }];
  const modKey = useModKeyLabel();

  return (
    // 导航栏常驻在根布局里；音乐页是固定深色的沉浸页面，导航栏跟着用深色样式
    <div className={pathname === '/music' ? 'dark contents' : 'contents'}>
      {/* PC端导航栏 */}
      <header className={`hidden md:block w-full fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b ${showNav ? 'translate-y-0' : '-translate-y-full'} bg-white/40 dark:bg-slate-900/50 dark:bg-gradient-to-b dark:from-black/50 dark:to-transparent backdrop-blur-xl border-white/20 dark:border-white/5 shadow-sm`}>
        <div className="w-[90%] max-w-6xl mx-auto h-16 flex items-center justify-between px-4 sm:px-[30px] box-border">
          <Link href="/" className="text-xl font-black text-slate-800 dark:text-white tracking-tighter hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-300">
            {siteConfig.navTitle || siteConfig.authorName}
            <span className="text-indigo-500 mx-1">{siteConfig.navSuffix || 'の'}</span>
            {siteConfig.navAfter || '宝藏之地'}
          </Link>
          <nav className="flex items-center gap-7 text-sm font-bold dark:[text-shadow:0_1px_6px_rgba(0,0,0,0.55)]">
            {NAV_ITEMS.map((item) => {
              if (isGroup(item)) return <NavDropdown key={item.name} group={item} pathname={pathname} />;
              const isActive = matchPath(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} className={`relative py-1 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200 hover:text-indigo-600'}`}>
                  {item.name}
                  {isActive && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-500 rounded-full animate-pulse"></span>}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={openCommandPalette}
              aria-label="搜索与命令（快捷键 Ctrl/⌘ + K）"
              title="搜索文章、跳转页面、切换设置"
              className="flex items-center gap-1.5 rounded-full border border-slate-300/60 bg-white/40 py-1 pl-2.5 pr-1.5 text-xs font-bold text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:text-indigo-400"
            >
              <Search size={14} />
              <kbd className="rounded-md border border-slate-400/40 bg-white/60 px-1.5 py-0.5 font-sans text-[10px] font-bold text-slate-600 shadow-[inset_0_-1px_0_rgba(15,23,42,0.08)] dark:border-white/25 dark:bg-white/10 dark:text-slate-100">{modKey} K</kbd>
            </button>
          </nav>
        </div>
      </header>

      {/* 📱 手机端：贴在右边缘、可上下拖动的毛玻璃小把手。
          可见部分只有 24px 宽，按钮本身 40×64，向左多出的透明区域只用来扩大点按范围 */}
      <div className="md:hidden">
        <motion.button
          type="button"
          aria-label="打开导航菜单"
          aria-expanded={isMobileMenuOpen}
          title="导航菜单（可上下拖动）"
          drag="y"
          dragConstraints={constraints}
          dragElastic={0.1}
          dragMomentum={false}
          style={{ y: dragY }}
          onClick={() => {
            if (Math.abs(dragY.getVelocity()) < 10) {
              setIsMobileMenuOpen(true);
            }
          }}
          // 只过渡 translate / opacity：transform 由拖拽逐帧写入，不能被 CSS 过渡拖慢
          className={`group fixed top-1/2 right-0 -translate-y-1/2 z-[60] flex h-16 w-10 items-center justify-end touch-none transition-[translate,opacity] duration-300 ${isMobileMenuOpen ? 'translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}
        >
          <span className="flex h-14 w-6 items-center justify-center gap-[3px] rounded-l-2xl border border-r-0 border-white/40 bg-white/60 pl-0.5 shadow-md ring-1 ring-black/5 backdrop-blur-md transition-transform duration-200 group-active:scale-95 dark:border-white/10 dark:bg-slate-800/60 dark:ring-white/10">
            <span className="h-5 w-[3px] rounded-full bg-indigo-500/70 dark:bg-indigo-400/80" />
            <span className="h-5 w-[3px] rounded-full bg-indigo-500/40 dark:bg-indigo-400/50" />
          </span>
        </motion.button>

        {/* 2. 居中展开的巨型全圆转轴 */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[65]"
              />

              <motion.div
                initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
                transition={{ type: 'spring', damping: 20, stiffness: 150 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] z-[70] pointer-events-none"
              >
                <motion.div
                  ref={wheelRef}
                  style={{ rotate: smoothRotation }}
                  onPan={handlePan}
                  className="w-full h-full rounded-full border border-white/40 dark:border-white/10 bg-white/55 dark:bg-slate-800/55 ring-1 ring-black/5 dark:ring-white/5 backdrop-blur-xl shadow-2xl pointer-events-auto relative cursor-grab active:cursor-grabbing"
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white/50 dark:bg-slate-900/40 ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center shadow-inner z-10">
                    <button
                      type="button"
                      aria-label="关闭导航菜单"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-12 h-12 rounded-full border border-white/60 bg-white/80 dark:border-white/10 dark:bg-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-md hover:text-indigo-600 dark:hover:text-indigo-400 hover:rotate-90 transition-all duration-300 active:scale-95"
                    >
                      <X size={20} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </div>

                  {/* 🌟 手机端轮盘渲染：使用过滤后的 mobileNavLinks */}
                  {mobileNavLinks.map((link, index) => {
                    const isActive = matchPath(pathname, link.href);
                    // 🌟 角度计算也会基于过滤后的长度，保证图标自动均匀排布！
                    const angle = index * (360 / mobileNavLinks.length);

                    return (
                      <div
                        key={link.href}
                        className="absolute top-1/2 left-1/2 w-14 h-14 -ml-7 -mt-7 flex items-center justify-center"
                        style={{
                          transform: `rotate(${angle}deg) translateY(-124px) rotate(${-angle}deg)`
                        }}
                      >
                        <motion.div style={{ rotate: inverseRotation }} className="w-full h-full">
                          <Link
                            href={link.href}
                            onClick={(e) => {
                              setIsMobileMenuOpen(false);
                              if (link.href === SEARCH_HREF) {
                                e.preventDefault();
                                openCommandPalette();
                              }
                            }}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex items-center justify-center w-full h-full rounded-full border transition-all duration-300 ${
                              isActive
                                ? 'border-indigo-400/60 bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 scale-110'
                                : 'border-white/60 bg-white/80 text-slate-700 shadow-md hover:scale-110 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:text-indigo-400'
                            }`}
                          >
                            <span className="text-[11px] font-black">{link.name}</span>
                          </Link>
                        </motion.div>
                      </div>
                    );
                  })}
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}