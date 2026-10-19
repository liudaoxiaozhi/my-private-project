"use client";
// components/Sakura.tsx —— 全站飘落层（siteConfig.enableSakura 开关）：平时是樱花，节日换成雪花 / 红梅 / 彩纸
//
// - 放在页面最上层、不拦截点击。放在毛玻璃卡片「前面」而不是背景里：背景里的动画会让每张毛玻璃卡片
//   每一帧都重新计算模糊，是卡顿的主要来源
// - 分远、中、近三层营造景深：远处小而慢、颜色淡；中间是主体；近处几片大花瓣从眼前飘过；
//   每层各自隔一阵被风吹向一边（周期不同，不会整齐划一）
// - 「完整」档三层都有；「简洁」档只留中间一层、数量减半；手机更少；夜间模式稍淡；
//   系统开启「减少动态效果」时不显示
// - 节日由 lib/seasons.ts 按读者本地日期判断（siteConfig.enableSeasonal 可关闭）；
//   想提前看效果：网址后面加 ?season=snow（或 plum / confetti / sakura）
// - 首帧（含服务端渲染）不渲染任何花瓣，挂载后再随机生成，避免 Hydration 不一致

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { useEffectsLevel } from './EffectGate';
import PetalField, { makePieces } from './PetalField';
import type { Piece } from './PetalField';
import { getSeason } from '../lib/seasons';
import type { Season } from '../lib/seasons';
import { siteConfig } from '../siteConfig';
import { subscribeReduceMotion, reduceMotion } from '../lib/effects';

/** 这些页面有自己的沉浸式背景，不飘花瓣 */
const EXCLUDED = [/^\/music(\/|$)/];
const SEASONS: readonly Season[] = ['sakura', 'snow', 'plum', 'confetti'];

/** 今天飘什么：网址里的 ?season= 预览优先，其次按节日 */
export function currentSeason(): Season {
  const preview = new URLSearchParams(window.location.search).get('season');
  if (preview && (SEASONS as readonly string[]).includes(preview)) return preview as Season;
  return siteConfig.enableSeasonal === false ? 'sakura' : getSeason(new Date(), siteConfig.birthday).season;
}

interface Layers {
  far: Piece[];
  mid: Piece[];
  near: Piece[];
}

const EMPTY: Layers = { far: [], mid: [], near: [] };

function makeLayers(mobile: boolean, lite: boolean): Layers {
  if (lite) return { far: [], mid: makePieces(mobile ? 6 : 14, { size: [12, 20] }), near: [] };
  return {
    far: makePieces(mobile ? 6 : 20, { size: [7, 11], fall: [18, 28], delayMax: 28 }),
    mid: makePieces(mobile ? 10 : 26, { size: [13, 22], fall: [11, 18] }),
    near: mobile ? [] : makePieces(6, { size: [28, 40], fall: [7, 11], delayMax: 12 }),
  };
}

export default function Sakura() {
  const pathname = usePathname();
  const { isDark } = useTheme();
  const [layers, setLayers] = useState<Layers>(EMPTY);
  const [season, setSeason] = useState<Season>('sakura');
  // 「阅读」档整个不挂载（见 EffectGate）
  const lite = useEffectsLevel() === 'lite';

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setSeason(currentSeason());
      setLayers(reduceMotion() ? EMPTY : makeLayers(mobile.matches, lite));
    };
    update();
    const unsubscribe = subscribeReduceMotion(update);
    mobile.addEventListener('change', update);
    return () => {
      unsubscribe();
      mobile.removeEventListener('change', update);
    };
  }, [lite]);

  if (layers.mid.length === 0 || EXCLUDED.some((re) => re.test(pathname ?? ''))) return null;

  // 雪花在浅色背景上本来就淡，不再额外压低；夜间樱花稍淡，像月光下的夜樱
  const base = season === 'snow' ? (isDark ? 0.8 : 1) : isDark ? 0.7 : 0.92;
  return (
    <>
      {layers.far.length > 0 && <PetalField pieces={layers.far} season={season} opacity={base * 0.7} className="z-[54]" gust={23} />}
      <PetalField pieces={layers.mid} season={season} opacity={base} gust={lite ? undefined : 17} />
      {layers.near.length > 0 && <PetalField pieces={layers.near} season={season} opacity={base * 0.85} className="z-[55]" gust={13} />}
    </>
  );
}
