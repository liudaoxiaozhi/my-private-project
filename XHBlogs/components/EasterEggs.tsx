"use client";
// components/EasterEggs.tsx —— 全站小彩蛋（放在根布局里，不显示任何常驻界面）
//
// - 控制台：打开开发者工具能看到一个字符画和一句招呼
// - 标签页标题：切到别的标签页时变成「Master 快回来～」，回来时显示「欢迎回来！」再恢复
// - 节日：节日当天桌宠送上一句祝福（每个节日每年只说一次，见 lib/seasons.ts）
// - 科乐美秘籍：键盘按 ↑↑↓↓←→←→BA，触发十秒樱花风暴 + 烟花
// - 小撒花：读完文章等场合撒一小把花瓣（lib/petBus.ts 的 petalBurst）；「阅读」档不撒

import { useEffect, useState } from 'react';
import PetalField, { makePieces } from './PetalField';
import type { Piece } from './PetalField';
import Fireworks from './Fireworks';
import { currentSeason } from './Sakura';
import { PETAL_BURST_EVENT, sendPetCommand } from '../lib/petBus';
import { getSeason } from '../lib/seasons';
import type { Season } from '../lib/seasons';
import { readJSON, writeJSON } from '../lib/localStore';
import { siteConfig } from '../siteConfig';
import { reduceMotion } from '../lib/effects';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const STORM_MS = 10_000;
const BURST_MS = 7000;
const AWAY_TITLE = '(｡•́︿•̀｡) Master 快回来～';
const BACK_TITLE = '✨ 欢迎回来！';
const BACK_MS = 2000;
const GREETED_KEY = 'season-greeted';

const ASCII = String.raw`
       ✿       ✿
   ✿     \  |  /     ✿
      ── (  ✿  ) ──
   ✿     /  |  \     ✿
       ✿       ✿`;

let consoleGreeted = false;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export default function EasterEggs() {
  const [storm, setStorm] = useState<{ pieces: Piece[]; season: Season; motion: boolean; fireworks: boolean; ms: number } | null>(null);

  // 控制台彩蛋（整个页面生命周期只打印一次）
  useEffect(() => {
    if (consoleGreeted) return;
    consoleGreeted = true;
    console.log(`%c${ASCII}`, 'color:#ec4899;font-weight:bold;line-height:1.1');
    console.log(
      `%c欢迎来到 ${siteConfig.title}！%c\n既然打开了控制台，说明你也是同道中人吧。\n试试在页面上按 ↑↑↓↓←→←→BA ？`,
      'color:#fff;background:linear-gradient(90deg,#818cf8,#ec4899);padding:4px 10px;border-radius:6px;font-weight:bold',
      'color:#94a3b8',
    );
  }, []);

  // 标签页标题
  useEffect(() => {
    let original = '';
    let restoreTimer: number | undefined;
    const onVisibility = () => {
      window.clearTimeout(restoreTimer);
      if (document.visibilityState === 'hidden') {
        if (document.title !== AWAY_TITLE && document.title !== BACK_TITLE) original = document.title;
        document.title = AWAY_TITLE;
      } else if (original) {
        document.title = BACK_TITLE;
        restoreTimer = window.setTimeout(() => {
          // 期间如果站内换了页（标题已被改成别的），就不再覆盖
          if (document.title === BACK_TITLE) document.title = original;
        }, BACK_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(restoreTimer);
    };
  }, []);

  // 节日祝福：等桌宠出场后再说
  useEffect(() => {
    if (siteConfig.enableSeasonal === false) return;
    const { greeting, greetingKey } = getSeason(new Date(), siteConfig.birthday);
    if (!greeting || !greetingKey) return;
    const greeted = readJSON<string[]>(GREETED_KEY) ?? [];
    if (greeted.includes(greetingKey)) return;
    const timer = window.setTimeout(() => {
      sendPetCommand({ type: 'say', text: greeting, ms: 6000 });
      writeJSON(GREETED_KEY, [...greeted.slice(-10), greetingKey]);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  // 科乐美秘籍
  useEffect(() => {
    let progress = 0;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      progress = key === KONAMI[progress] ? progress + 1 : key === KONAMI[0] ? 1 : 0;
      if (progress < KONAMI.length) return;
      progress = 0;
      const motion = !reduceMotion();
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      setStorm({
        pieces: motion ? makePieces(mobile ? 36 : 80, { fall: [3, 6], delayMax: 4, once: true, size: [12, 26] }) : [],
        season: currentSeason(),
        motion,
        fireworks: true,
        ms: STORM_MS,
      });
      sendPetCommand({ type: 'say', text: '这是……传说中的秘籍？！樱花风暴，发动！', ms: 5000 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 小撒花
  useEffect(() => {
    const onBurst = () => {
      if (document.documentElement.getAttribute('data-effects') === 'off') return;
      if (reduceMotion()) return;
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      setStorm((current) =>
        current ?? {
          pieces: makePieces(mobile ? 12 : 26, { fall: [3.5, 6], delayMax: 2, once: true, size: [12, 22] }),
          season: currentSeason(),
          motion: true,
          fireworks: false,
          ms: BURST_MS,
        },
      );
    };
    window.addEventListener(PETAL_BURST_EVENT, onBurst);
    return () => window.removeEventListener(PETAL_BURST_EVENT, onBurst);
  }, []);

  useEffect(() => {
    if (!storm) return;
    const timer = window.setTimeout(() => setStorm(null), storm.ms);
    return () => window.clearTimeout(timer);
  }, [storm]);

  if (!storm || !storm.motion) return null;
  return (
    <>
      <PetalField pieces={storm.pieces} season={storm.season} once className="z-[56]" />
      {storm.fireworks && <Fireworks duration={storm.ms - 1000} />}
    </>
  );
}
