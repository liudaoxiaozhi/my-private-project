"use client";
// components/HideOnReader.tsx —— 小说章节阅读页不显示的全站浮层（悬浮播放器、猫、工具箱、返回按钮、点击涟漪）

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isReaderPath } from '../lib/routes';

export default function HideOnReader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isReaderPath(pathname) ? null : <>{children}</>;
}
