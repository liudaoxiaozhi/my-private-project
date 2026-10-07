"use client";
// components/PetSaber.tsx —— 右下角的桌宠：Q 版骑士少女趴在屏幕底边的小台子上（替代原来的赛博猫）
//
// 交互：
// - 悬停：探出头一点；点她：摸摸头（弹一下 + 飘爱心 + 说一句话）
// - 💬 聊天：走 /api/chat（Gemini，人设在 siteConfig.geminiConfig.systemPrompt；未配置密钥时会说一句兜底的话）
// - 🍔 喂食：本地随机台词，不消耗接口额度
// - 收起：缩到台子下面只露出呆毛，点一下再出来；收起状态记在浏览器里（只影响自己）
// 闲着时偶尔歪头、自言自语。系统开启「减少动态效果」时不做循环动画。
// Hydration：首帧固定为「展开」，挂载后再读取本地的收起状态。

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EyeOff, MessageCircle, Send } from 'lucide-react';
import AppImage from './AppImage';

const IMG = { src: '/images/pet/saber.webp', width: 360, height: 364, edge: 0.9262 } as const;
const PET_WIDTH = 150;
const PET_HEIGHT = Math.round((PET_WIDTH * IMG.height) / IMG.width);
const LEDGE_HEIGHT = 10;
/** 让图里「趴着的那条边」正好对齐台面 */
const PET_BOTTOM = LEDGE_HEIGHT - Math.round(PET_HEIGHT * (1 - IMG.edge));
const HIDDEN_KEY = 'pet-hidden';
/** 上方留白：悬停探头时呆毛不被裁掉 */
const HEADROOM = 16;

const PET_LINES = ['嗯……被摸头了。', 'Master，请不要一直摸我的头。', '……（呆毛晃了晃）', '这样也不坏。', '骑士的头不是随便摸的……下不为例。'];
const FEED_LINES = ['汉堡！Master 真是体贴。', '唔，好吃……还有吗？', '补给完毕，随时可以出发。', '这份恩情，我会记住的。', '吃饱了才有力气守护这里。'];
const IDLE_LINES = ['Master，写累了就休息一下吧。', '今天的樱花也很漂亮。', '这里的书架，我有好好守着。', '……肚子有点饿了。', '有新的文章吗？我想看看。'];

const pick = (lines: readonly string[]): string => lines[Math.floor(Math.random() * lines.length)];

interface ChatReply {
  reply?: unknown;
}

interface Heart {
  id: number;
  x: number;
}

export default function PetSaber() {
  const reduceMotion = useReducedMotion();
  const [hidden, setHidden] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [bounce, setBounce] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const speechTimer = useRef<number | undefined>(undefined);
  const heartId = useRef(0);

  // ---------- 说话 ----------
  const speak = useCallback((text: string, ms = 4500) => {
    setSpeech(text);
    window.clearTimeout(speechTimer.current);
    speechTimer.current = window.setTimeout(() => setSpeech(null), ms);
  }, []);

  useEffect(() => () => window.clearTimeout(speechTimer.current), []);

  // ---------- 读取收起状态 ----------
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDDEN_KEY) === '1');
    } catch {
      /* 存储不可用时默认展开 */
    }
  }, []);

  const setHiddenPersist = (value: boolean) => {
    setHidden(value);
    setShowInput(false);
    setSpeech(null);
    try {
      window.localStorage.setItem(HIDDEN_KEY, value ? '1' : '0');
    } catch {
      /* 忽略 */
    }
  };

  // ---------- 闲置：偶尔歪头、自言自语 ----------
  useEffect(() => {
    if (hidden || reduceMotion) return;
    let timer: number;
    const loop = () => {
      timer = window.setTimeout(() => {
        setTilt((t) => (t === 0 ? (Math.random() > 0.5 ? 4 : -4) : 0));
        loop();
      }, 3500 + Math.random() * 4000);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [hidden, reduceMotion]);

  useEffect(() => {
    if (hidden) return;
    const timer = window.setInterval(() => {
      if (!speech && !showInput && !thinking && Math.random() > 0.7) speak(pick(IDLE_LINES), 4000);
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [hidden, speech, showInput, thinking, speak]);

  // ---------- 交互 ----------
  const pet = () => {
    if (hidden) {
      setHiddenPersist(false);
      return;
    }
    setBounce((b) => b + 1);
    speak(pick(PET_LINES), 2600);
    const id = heartId.current++;
    setHearts((hs) => [...hs, { id, x: Math.random() * 60 - 30 }]);
    window.setTimeout(() => setHearts((hs) => hs.filter((h) => h.id !== id)), 1200);
  };

  const feed = (e: MouseEvent) => {
    e.stopPropagation();
    setBounce((b) => b + 1);
    speak(pick(FEED_LINES), 3200);
  };

  const sendChat = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || thinking) return;
    setInput('');
    setShowInput(false);
    setThinking(true);
    speak('让我想想……', 15_000);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ChatReply;
      speak(typeof data.reply === 'string' && data.reply ? data.reply : '……（她好像在走神）', 8000);
    } catch {
      speak('抱歉 Master，现在好像联络不上……稍后再试吧。', 4000);
    } finally {
      setThinking(false);
    }
  };

  const BTN =
    'flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/90 text-slate-600 shadow-md transition-all duration-200 hover:scale-110 hover:text-indigo-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-white/10 dark:bg-slate-800/90 dark:text-slate-300 dark:hover:text-indigo-400';

  return (
    <div className="group fixed bottom-0 right-[264px] z-[9998] select-none" style={{ width: PET_WIDTH + 30 }}>
      {/* 💬 气泡 */}
      <div className="pointer-events-none absolute bottom-full left-1/2 flex w-[240px] -translate-x-1/2 justify-center">
        <AnimatePresence>
          {speech && !hidden && (
            <motion.p
              key={speech}
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
              role="status"
              className="relative max-w-[240px] break-words rounded-2xl border border-slate-100 bg-white px-4 py-2.5 text-center text-sm leading-relaxed text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              style={{ transformOrigin: 'bottom center' }}
            >
              {speech}
              <span className="absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800" />
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* 操作按钮：悬停或键盘聚焦时出现 */}
      {!hidden && (
        <div className="absolute -left-11 flex flex-col gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" style={{ bottom: LEDGE_HEIGHT + 14 }}>
          <button type="button" className={BTN} onClick={(e) => { e.stopPropagation(); setShowInput((v) => !v); }} aria-label="和她聊天" title="聊天">
            <MessageCircle size={17} />
          </button>
          <button type="button" className={`${BTN} text-base`} onClick={feed} aria-label="喂她吃汉堡" title="喂食">
            <span aria-hidden="true">🍔</span>
          </button>
          <button type="button" className={BTN} onClick={(e) => { e.stopPropagation(); setHiddenPersist(true); }} aria-label="收起桌宠" title="收起">
            <EyeOff size={16} />
          </button>
        </div>
      )}

      {/* ⌨️ 聊天输入框 */}
      <AnimatePresence>
        {showInput && !hidden && (
          <motion.form
            initial={{ opacity: 0, x: 10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.95 }}
            onSubmit={sendChat}
            className="absolute right-full mr-14 flex w-60 items-center rounded-full border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800"
            style={{ bottom: LEDGE_HEIGHT + 40 }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="想对她说点什么？"
              maxLength={300}
              disabled={thinking}
              autoFocus
              aria-label="聊天内容"
              className="w-full border-none bg-transparent px-3 py-1 text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-white"
            />
            <button
              type="submit"
              disabled={thinking || !input.trim()}
              aria-label="发送"
              className={`ml-1 flex shrink-0 items-center justify-center rounded-full p-1.5 transition-colors ${thinking || !input.trim() ? 'bg-slate-200 text-slate-400 dark:bg-slate-700' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
            >
              <Send size={14} />
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 🧍 本体：底部被屏幕边缘裁住；压在台面上方（z-10），手搭在台面边上 */}
      <div className="relative z-10 mx-auto overflow-hidden" style={{ width: PET_WIDTH, height: PET_HEIGHT + PET_BOTTOM + HEADROOM }}>
        <motion.button
          type="button"
          onClick={pet}
          aria-label={hidden ? '叫她出来' : '摸摸头'}
          title={hidden ? '叫她出来' : '摸摸头'}
          className="absolute left-0 cursor-pointer focus-visible:outline-none"
          style={{ width: PET_WIDTH, height: PET_HEIGHT, bottom: PET_BOTTOM, transformOrigin: '50% 100%' }}
          animate={{ y: hidden ? PET_HEIGHT * 0.8 : 0, rotate: hidden ? 0 : tilt }}
          whileHover={hidden || reduceMotion ? undefined : { y: -8 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        >
          {/* 摸头时弹一下（外层，弹簧）；闲置时轻轻呼吸（内层，循环）——弹簧动画不支持多关键帧，所以分两层 */}
          <motion.div
            key={bounce}
            className="h-full w-full"
            style={{ transformOrigin: '50% 100%' }}
            initial={bounce > 0 && !reduceMotion ? { scaleY: 0.9, scaleX: 1.05 } : false}
            animate={{ scaleY: 1, scaleX: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 12 }}
          >
            <motion.div
              className="h-full w-full"
              style={{ transformOrigin: '50% 100%' }}
              animate={reduceMotion || hidden ? undefined : { scaleY: [1, 1.015, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <AppImage src={IMG.src} alt="Q 版骑士少女桌宠" width={PET_WIDTH * 2} height={PET_HEIGHT * 2} className="h-full w-full object-contain drop-shadow-[0_6px_10px_rgba(15,23,42,0.25)]" draggable={false} />
            </motion.div>
          </motion.div>
        </motion.button>

        {/* 飘起的爱心 */}
        <AnimatePresence>
          {hearts.map((h) => (
            <motion.span
              key={h.id}
              aria-hidden="true"
              initial={{ opacity: 0, y: 0, x: h.x, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], y: -70, scale: 1.1 }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
              className="pointer-events-none absolute left-1/2 top-6 text-lg text-pink-500"
            >
              ♥
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* 台面：一小块毛玻璃 */}
      <div
        aria-hidden="true"
        className="relative z-0 mx-auto rounded-t-xl border border-b-0 border-white/50 bg-white/60 shadow-[0_-4px_14px_rgba(15,23,42,0.08)] backdrop-blur-md dark:border-white/10 dark:bg-slate-800/70"
        style={{ height: LEDGE_HEIGHT, width: PET_WIDTH + 30, marginTop: -LEDGE_HEIGHT }}
      />
    </div>
  );
}
