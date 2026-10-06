// lib/theme.ts —— 主题相关常量（普通模块，Server / Client Component 都可引入）
// 注意：不能放进 'use client' 文件里导出，否则 Server Component 拿到的是客户端引用而不是字符串。

/** localStorage 中保存主题的键名（与旧版保持一致，老访客的偏好不会丢） */
export const THEME_STORAGE_KEY = 'blog-theme';

/**
 * 首帧防闪烁脚本：在 <head> 中同步执行，页面绘制前就把 dark 类挂到 <html> 上。
 * 没有记录时默认深色（流萤飞舞）。由 app/layout.tsx 内联注入。
 */
export const themeInitScript = `(function () {
  var root = document.documentElement;
  var dark = true;
  try { dark = localStorage.getItem('${THEME_STORAGE_KEY}') !== 'light'; } catch (e) {}
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
})();`;
