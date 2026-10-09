"use client";
// lib/playerPresence.ts —— 页面上的「完整播放器」（首页播放器卡片、文章 / 杂谈侧栏的 NOW PLAYING）此刻是否在屏幕上。
// 在的时候，桌宠台子上的迷你播放器（components/PetSaber.tsx）收起来，同一屏不出现两个播放器；滚走了再出来。

import { useEffect, useState, useSyncExternalStore } from 'react';

const onScreen = new Set<object>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 有没有完整播放器在屏幕上 */
export function useFullPlayerOnScreen(): boolean {
  return useSyncExternalStore(subscribe, () => onScreen.size > 0, () => false);
}

/** 完整播放器把返回的 ref 挂到自己的根元素上，进出屏幕时自动登记 */
export function useFullPlayerRef(): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const key = {};
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onScreen.add(key);
        else onScreen.delete(key);
        emit();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      onScreen.delete(key);
      emit();
    };
  }, [el]);
  return setEl;
}
