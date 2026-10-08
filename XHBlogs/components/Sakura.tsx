"use client";
// components/Sakura.tsx —— 全站飘落层（siteConfig.enableSakura 开关）：平时是樱花，节日换成雪花 / 红梅 / 彩纸
//
// - 放在页面最上层、不拦截点击。放在毛玻璃卡片「前面」而不是背景里：背景里的动画会让每张毛玻璃卡片
//   每一帧都重新计算模糊，是卡顿的主要来源
// - 电脑 24 片、手机 10 片；「简洁」档减半；夜间模式更淡；系统开启「减少动态效果」时不显示
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

/** 这些页面有自己的沉浸式背景，不飘花瓣 */
const EXCLUDED = [/^\/music(\/|$)/];
const SEASONS: readonly Season[] = ['sakura', 'snow', 'plum', 'confetti'];

/** 今天飘什么：网址里的 ?season= 预览优先，其次按节日 */
export function currentSeason(): Season {
  const preview = new URLSearchParams(window.location.search).get('season');
  if (preview && (SEASONS as readonly string[]).includes(preview)) return preview as Season;
  return siteConfig.enableSeasonal === false ? 'sakura' : getSeason(new Date(), siteConfig.birthday).season;
}

export default function Sakura() {
  const pathname = usePathname();
  const { isDark } = useTheme();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [season, setSeason] = useState<Season>('sakura');
  // 「简洁」档花瓣减半（「阅读」档整个不挂载，见 EffectGate）
  const lite = useEffectsLevel() === 'lite';

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setSeason(currentSeason());
      setPieces(reduce.matches ? [] : makePieces((mobile.matches ? 10 : 24) / (lite ? 2 : 1)));
    };
    update();
    reduce.addEventListener('change', update);
    mobile.addEventListener('change', update);
    return () => {
      reduce.removeEventListener('change', update);
      mobile.removeEventListener('change', update);
    };
  }, [lite]);

  if (pieces.length === 0 || EXCLUDED.some((re) => re.test(pathname ?? ''))) return null;

  // 雪花在浅色背景上本来就淡，不再额外压低
  const opacity = season === 'snow' ? (isDark ? 0.8 : 1) : isDark ? 0.55 : 0.9;
  return <PetalField pieces={pieces} season={season} opacity={opacity} />;
}
