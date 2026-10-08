// lib/effects.ts —— 全站视觉特效档位（只存在读者自己的浏览器里）
//
//   完整 full：樱花、弹幕、萤火虫与草地、点击涟漪、背景轮播全部开启
//   简洁 lite：保留背景轮播和少量樱花，关掉弹幕、萤火虫与草地、点击涟漪
//   阅读 off ：背景固定为一张静态图，所有循环动画停掉
//   自动 auto（默认）：普通设备用「完整」；低配设备、开了省流量用「简洁」；系统开了「减少动态效果」用「阅读」
//
// 档位写在 <html data-effects="…"> 上：
// - effectsInitScript 在 <head> 里同步执行，首屏绘制前就定好档位，不会先播一下再停
// - globals.css 按这个属性隐藏对应的特效（防闪烁）；EffectGate / useEffectsLevel 再把不需要的组件整个卸载（省 JS）

export type EffectsLevel = 'full' | 'lite' | 'off';
export type EffectsPreference = EffectsLevel | 'auto';

export const EFFECTS_STORAGE_KEY = 'effects-level';
const CHANGE_EVENT = 'effects-level-change';
const LEVELS: readonly EffectsLevel[] = ['off', 'lite', 'full'];

/**
 * 「自动」档的判断。会被 toString() 内联进首屏脚本，函数体必须自给自足（不能引用外部变量）。
 */
function detectAutoLevel(): EffectsLevel {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off';
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const lowCpu = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const saveData = nav.connection?.saveData === true;
  return lowCpu || lowMemory || saveData ? 'lite' : 'full';
}

/** 读取本地保存的偏好并写到 <html> 上；同样会被内联进首屏脚本 */
function applyStoredLevel(storageKey: string, detect: () => EffectsLevel): void {
  let pref: string | null = null;
  try {
    // 存的是纯字符串；兼容带引号的 JSON 写法
    pref = (localStorage.getItem(storageKey) || '').replace(/"/g, '');
  } catch {
    /* 存储不可用时按「自动」处理 */
  }
  const level = pref === 'full' || pref === 'lite' || pref === 'off' ? pref : detect();
  document.documentElement.setAttribute('data-effects', level);
}

export const effectsInitScript = `try{(${applyStoredLevel.toString()})(${JSON.stringify(EFFECTS_STORAGE_KEY)},${detectAutoLevel.toString()})}catch(e){}`;

export function getEffectsPreference(): EffectsPreference {
  let pref: string | null = null;
  try {
    pref = (localStorage.getItem(EFFECTS_STORAGE_KEY) || '').replace(/"/g, '');
  } catch {
    /* 存储不可用 */
  }
  return pref === 'full' || pref === 'lite' || pref === 'off' ? pref : 'auto';
}

/** 「自动」档此刻会落到哪一档（设置面板里显示给读者看） */
export function getAutoLevel(): EffectsLevel {
  return detectAutoLevel();
}

export function setEffectsPreference(pref: EffectsPreference): void {
  try {
    localStorage.setItem(EFFECTS_STORAGE_KEY, pref);
  } catch {
    /* 存储不可用时本次浏览仍然生效（下面直接写到页面上） */
  }
  document.documentElement.setAttribute('data-effects', pref === 'auto' ? detectAutoLevel() : pref);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// —— 给 useSyncExternalStore 用：以 <html data-effects> 为准 ——

export function getEffectsLevel(): EffectsLevel {
  const level = document.documentElement.getAttribute('data-effects');
  return level === 'lite' || level === 'off' ? level : 'full';
}

export function subscribeEffects(onChange: () => void): () => void {
  // 其他标签页改了设置：本页也重新套用
  const onStorage = (e: StorageEvent) => {
    if (e.key !== EFFECTS_STORAGE_KEY) return;
    applyStoredLevel(EFFECTS_STORAGE_KEY, detectAutoLevel);
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** 当前档位是否达到 min（例如 min = 'lite' 时，简洁和完整都算） */
export function meetsLevel(level: EffectsLevel, min: EffectsLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(min);
}
