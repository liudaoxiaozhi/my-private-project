// lib/useIsClient.ts —— 是否已在浏览器中挂载（服务端渲染与首次 Hydration 时为 false）
//
// 用于 createPortal 到 document.body 等只能在浏览器里做的事；
// 用 useSyncExternalStore 而不是「useEffect 里 setMounted(true)」，避免多一次级联渲染。
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
