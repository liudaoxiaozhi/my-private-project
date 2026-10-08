// lib/commandPalette.ts —— ⌘K 命令面板的打开方式（导航栏按钮、手机轮盘、快捷键都走这里）
import { useSyncExternalStore } from 'react';

export const OPEN_PALETTE_EVENT = 'command-palette-open';

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

const noopSubscribe = () => () => {};
const isApple = (): boolean => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** 快捷键提示：苹果设备显示 ⌘，其他显示 Ctrl（服务端渲染时先按 ⌘ 输出） */
export function useModKeyLabel(): string {
  return useSyncExternalStore(noopSubscribe, () => (isApple() ? '⌘' : 'Ctrl'), () => '⌘');
}
