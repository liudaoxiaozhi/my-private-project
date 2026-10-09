"use client";
// components/HideOnReader.tsx —— 小说章节阅读页、网页后台不显示的全站浮层（导航栏、桌宠、樱花、工具箱、返回按钮、点击涟漪……）

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isAdminPath, isReaderPath } from '../lib/routes';

export default function HideOnReader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isReaderPath(pathname) || isAdminPath(pathname) ? null : <>{children}</>;
}
