"use client";
// components/toolbox/OmikujiTool.tsx —— 工具箱里的「今日御神签」：每天一支，抽完 Saber 会念签（签文在 data/omikuji.ts）

import { useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Ribbon } from 'lucide-react';
import { drawToday, getTodayOmikuji, omikujiText, resultOf, subscribeOmikuji, tieToday, toChineseNumber } from '../../lib/omikuji';
import { sendPetCommand } from '../../lib/petBus';

const SHAKE_MS = 1300;

export default function OmikujiTool() {
  const saved = useSyncExternalStore(subscribeOmikuji, getTodayOmikuji, () => null);
  const [shaking, setShaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const result = saved ? resultOf(saved) : null;

  const draw = () => {
    if (shaking) return;
    setShaking(true);
    window.setTimeout(() => {
      const r = drawToday();
      setShaking(false);
      sendPetCommand({ type: 'say', text: r.comment, ms: 6000 });
    }, SHAKE_MS);
  };

  const tie = () => {
    tieToday();
    sendPetCommand({ type: 'say', text: '系好了。坏运气就交给樱花吧。', ms: 4000 });
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(omikujiText(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用时不提示 */
    }
  };

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <motion.div
          aria-hidden="true"
          className="relative flex h-28 w-16 items-end justify-center rounded-b-2xl rounded-t-md bg-gradient-to-b from-amber-700 to-amber-900 shadow-lg ring-2 ring-amber-950/20"
          style={{ transformOrigin: '50% 90%' }}
          animate={shaking ? { rotate: [0, -14, 12, -10, 9, -6, 0] } : { rotate: 0 }}
          transition={{ duration: SHAKE_MS / 1000, ease: 'easeInOut' }}
        >
          {/* 签筒上露出的几根签 */}
          <span className="absolute -top-4 left-3 h-6 w-1.5 rounded-t bg-amber-100" />
          <span className="absolute -top-5 left-6 h-7 w-1.5 rounded-t bg-amber-50" />
          <span className="absolute -top-3 left-9 h-5 w-1.5 rounded-t bg-amber-100" />
          <span className="mb-3 text-lg font-black text-amber-100 [writing-mode:vertical-rl]">御神签</span>
          <AnimatePresence>
            {shaking && (
              <motion.span
                className="absolute -top-10 left-1/2 h-10 w-1.5 -translate-x-1/2 rounded-t bg-rose-200 shadow"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: SHAKE_MS / 1000 - 0.4, duration: 0.3 }}
              />
            )}
          </AnimatePresence>
        </motion.div>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">每天一支，看看今天的运势吧</p>
        <button
          type="button"
          onClick={draw}
          disabled={shaking}
          className="w-full rounded-full bg-indigo-500 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-600 disabled:opacity-60"
        >
          {shaking ? '摇签中……' : '🎋 摇一支签'}
        </button>
      </div>
    );
  }

  const isBad = result.level.tone === 'bad';

  return (
    <motion.div
      key={saved?.date}
      initial={{ opacity: 0, rotateX: -60, y: -10 }}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 18 }}
      style={{ transformPerspective: 600 }}
      className="flex max-h-[60vh] flex-col gap-2.5 overflow-y-auto"
    >
      <div className={`relative rounded-2xl border border-rose-200/70 bg-[#fffaf3] px-4 pb-3 pt-4 text-center shadow-inner dark:border-rose-300/20 dark:bg-slate-900/60 ${saved?.tied ? 'opacity-60' : ''}`}>
        <p className="text-[11px] font-bold tracking-[0.3em] text-slate-400">第{toChineseNumber(result.number)}番</p>
        <p className={`mt-1 text-4xl font-black ${result.level.color}`}>{result.level.name}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          {result.verse[0]}
          <br />
          {result.verse[1]}
        </p>
        {saved?.tied && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-600 dark:bg-pink-500/20 dark:text-pink-300">
            <Ribbon size={10} /> 已系上
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
        {result.categories.map((c) => (
          <div key={c.name} className="rounded-xl bg-white/60 px-2.5 py-1.5 dark:bg-slate-700/50">
            <dt className="font-black text-indigo-500 dark:text-indigo-300">{c.name}</dt>
            <dd className="leading-snug text-slate-600 dark:text-slate-300">{c.text}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1 rounded-xl bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
        <p><b className="text-emerald-600 dark:text-emerald-400">宜</b>　{result.good.join('、')}</p>
        <p><b className="text-rose-500">忌</b>　{result.bad.join('、')}</p>
        <p><b className="text-amber-600 dark:text-amber-400">幸运</b>　{result.item} · {result.color}</p>
      </div>

      <div className="flex gap-2">
        {isBad && !saved?.tied && (
          <button
            type="button"
            onClick={tie}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-pink-500 py-1.5 text-xs font-bold text-white shadow transition-colors hover:bg-pink-600"
          >
            <Ribbon size={13} /> 系在樱花枝上
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-white/70 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:text-indigo-500 dark:bg-slate-700/60 dark:text-slate-200"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? '已复制' : '复制签文'}
        </button>
      </div>
      <p className="text-center text-[10px] text-slate-400">明天再来抽一支吧</p>
    </motion.div>
  );
}
