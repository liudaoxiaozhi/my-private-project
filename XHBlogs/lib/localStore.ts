// lib/localStore.ts —— 读者浏览器本地存储的 JSON 读写（小说进度、阅读设置、文章阅读位置共用）
//
// 隐私模式或禁用存储时读写会失败，这里全部吞掉错误，页面功能不受影响。

export function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时忽略 */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 存储不可用时忽略 */
  }
}
