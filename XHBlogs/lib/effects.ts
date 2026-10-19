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
//
// 读者在「特效」菜单里手动选过档位时，<html> 上还会有 data-effects-choice="manual"：
// 这时以读者的选择为准，系统「减少动态效果」（Windows 关掉动画效果等）不再压住动画；选「自动」才跟随系统。
// 组件里判断要不要减少动画，统一用 reduceMotion() / useReduceMotion()，不要直接读系统设置。

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
  const manual = pref === 'full' || pref === 'lite' || pref === 'off';
  const root = document.documentElement;
  root.setAttribute('data-effects', manual ? (pref as string) : detect());
  if (manual) root.setAttribute('data-effects-choice', 'manual');
  else root.removeAttribute('data-effects-choice');
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
  const root = document.documentElement;
  root.setAttribute('data-effects', pref === 'auto' ? detectAutoLevel() : pref);
  if (pref === 'auto') root.removeAttribute('data-effects-choice');
  else root.setAttribute('data-effects-choice', 'manual');
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** 是否该减少动画：系统要求减少动态，并且读者没有在「特效」菜单里手动选过档位 */
export function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.getAttribute('data-effects-choice') === 'manual') return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

/** reduceMotion 的订阅：系统设置变了、或读者换了档位都会通知 */
export function subscribeReduceMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', onChange);
  const unsubscribe = subscribeEffects(onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    unsubscribe();
  };
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
