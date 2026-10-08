// lib/navTransition.ts —— 站内跳转时各个动效之间的协调（仅浏览器端使用）
//
// 点击封面卡片走「共享元素」视图过渡时，页面自身的入场动画要让位，
// 否则新页面会以透明状态被截进过渡画面里。

let viewTransitionNav = false;

export function setViewTransitionNav(active: boolean): void {
  viewTransitionNav = active;
}

export function isViewTransitionNav(): boolean {
  return viewTransitionNav;
}

/** 浏览器支持视图过渡、且读者没有开启「减少动态效果」 */
export function canUseViewTransition(): boolean {
  return (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
