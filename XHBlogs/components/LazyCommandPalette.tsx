"use client";
// components/LazyCommandPalette.tsx —— ⌘K 命令面板的「门卫」：常驻的只有这一小段，面板本身（搜索、工具……）第一次打开时才下载
//
// - 面板加载前，快捷键（⌘K / Ctrl+K；不在输入框里时按 /）和 openCommandPalette() 由这里接住：开始下载面板，
//   下载好就挂上并打开它；之后一切交给面板自己（components/CommandPalette.tsx）
// - 下载期间先放一个看不见的输入框接住按键：按完 Ctrl+K 马上打字不会丢字，手机上弹出的键盘也不会收回去。
//   面板的输入框拿到焦点后，把已经打的字和回车、↑↓、Esc 原样交给它；面板到之前按 Esc 或再按 Ctrl+K 就不打开了
// - 「最近看过」在面板加载前也照常记录（加载后由面板自己记）

import { useEffect, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import { OPEN_PALETTE_EVENT, openCommandPalette } from '../lib/commandPalette';
import { recordRecentPage } from '../lib/recentPages';

let loaded: ComponentType | null = null;
let loading: Promise<ComponentType> | null = null;

function loadPalette(): Promise<ComponentType> {
  loading ??= import('./CommandPalette').then(
    (m) => (loaded = m.default),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** 和面板里一样：等新页面的标题更新后再记 */
const RECENT_DELAY = 500;
/** 等面板时按下、之后转交给面板的键 */
const FORWARDED_KEYS = ['Enter', 'ArrowDown', 'ArrowUp', 'Escape'];
/** 面板挂上后这么久输入框还没拿到焦点，就不再等（撤掉占位输入框） */
const HANDOFF_TIMEOUT = 3000;

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/** 往面板的（受控）输入框里填字：用原生 setter 赋值再发 input 事件，React 才会走 onChange */
function typeInto(input: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!text || !setValue) return;
  setValue.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function LazyCommandPalette() {
  const pathname = usePathname();
  const [Palette, setPalette] = useState<ComponentType | null>(() => loaded);
  /** 已经要求打开，正在等面板 */
  const [waiting, setWaiting] = useState(false);
  const shellRef = useRef<HTMLInputElement>(null);
  const pressed = useRef<string[]>([]);

  // 面板加载前：接住快捷键和打开事件
  useEffect(() => {
    if (Palette) return;
    const request = () => {
      if (waiting) return;
      pressed.current = [];
      setWaiting(true);
      loadPalette().then(
        (component) => setPalette(() => component),
        () => setWaiting(false),
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // 和面板一样，Ctrl+K 是开关：还在等的时候再按一次就不打开了
        if (waiting) setWaiting(false);
        else request();
      } else if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        request();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, request);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, request);
    };
  }, [Palette, waiting]);

  // 面板刚挂上：打开它（面板自己的监听在它的 effect 里注册，比这里先执行）
  useEffect(() => {
    if (Palette && waiting) openCommandPalette();
  }, [Palette, waiting]);

  // 面板的输入框拿到焦点：把等待期间打的字、按的键交过去，再撤掉占位输入框
  useEffect(() => {
    if (!Palette || !waiting) return;
    let replayTimer = 0;
    const finish = () => setWaiting(false);
    const giveUp = window.setTimeout(finish, HANDOFF_TIMEOUT);
    const onFocusIn = (e: FocusEvent) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input === shellRef.current || !input.closest('[role="dialog"]')) return;
      document.removeEventListener('focusin', onFocusIn);
      window.clearTimeout(giveUp);
      const text = shellRef.current?.value ?? '';
      const keys = pressed.current.splice(0);
      // 等面板这次渲染提交完再填字；每个键之间让面板先按新的输入更新一次结果
      const replay = (i: number) => {
        if (i >= keys.length) return finish();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: keys[i], bubbles: true, cancelable: true }));
        replayTimer = window.setTimeout(() => replay(i + 1), 0);
      };
      queueMicrotask(() => {
        typeInto(input, text);
        replayTimer = window.setTimeout(() => replay(0), 0);
      });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      window.clearTimeout(giveUp);
      window.clearTimeout(replayTimer);
    };
  }, [Palette, waiting]);

  // 面板加载前也记「最近看过」
  useEffect(() => {
    if (Palette) return;
    const timer = window.setTimeout(() => {
      const title = document.title.split(' | ')[0].trim();
      if (title) recordRecentPage({ href: window.location.pathname, title });
    }, RECENT_DELAY);
    return () => window.clearTimeout(timer);
  }, [pathname, Palette]);

  const onShellKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && !Palette) {
      e.preventDefault();
      setWaiting(false);
    } else if (FORWARDED_KEYS.includes(e.key)) {
      e.preventDefault();
      pressed.current.push(e.key);
    }
  };

  return (
    <>
      {Palette && <Palette />}
      {waiting && (
        <input
          ref={shellRef}
          autoFocus
          aria-label="正在打开搜索"
          onKeyDown={onShellKey}
          className="pointer-events-none fixed left-0 top-0 h-px w-px text-base opacity-0"
        />
      )}
    </>
  );
}
