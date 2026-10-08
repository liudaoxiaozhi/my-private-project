"use client";
// components/PetSaber.tsx —— 右下角的桌宠：Q 版骑士少女趴在屏幕底边的小台子上（替代原来的赛博猫）
//
// 交互：
// - 悬停：探出头一点；点她：摸摸头（弹一下 + 飘爱心 + 说一句话）
// - 💬 聊天：走 /api/chat（Gemini，人设在 siteConfig.geminiConfig.systemPrompt；未配置密钥时会说一句兜底的话）
// - 🍔 喂食：本地随机台词，不消耗接口额度
// - 收起：缩到台子下面只露出呆毛，点一下再出来；收起状态记在浏览器里（只影响自己）
// - 拖动：按住她或台子拖到页面任意位置（聚焦时也可以用方向键挪），位置同样记在浏览器里
// - 听指令（lib/petBus.ts）：工具箱「召回桌宠」让她回到默认位置；御神签等让她说一句话
// - 有存在感：每次打开网站按时间打招呼；进不同栏目说不同的话（每次浏览每个栏目一次）；
//   一分半没动静会打瞌睡（冒 Zzz，有动静就醒）；连着摸太多下会生气
// 闲着时偶尔歪头、自言自语。系统开启「减少动态效果」时不做循环动画。
// Hydration：首帧固定为「展开」、默认位置，挂载后再读取本地的收起状态和位置。

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { FormEvent, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EyeOff, MessageCircle, Send } from 'lucide-react';
import AppImage from './AppImage';
import { PET_COMMAND_EVENT } from '../lib/petBus';
import type { PetCommand } from '../lib/petBus';

const IMG = { src: '/images/pet/saber.webp', width: 360, height: 364, edge: 0.9262 } as const;
const PET_WIDTH = 150;
const PET_HEIGHT = Math.round((PET_WIDTH * IMG.height) / IMG.width);
const LEDGE_HEIGHT = 10;
/** 让图里「趴着的那条边」正好对齐台面 */
const PET_BOTTOM = LEDGE_HEIGHT - Math.round(PET_HEIGHT * (1 - IMG.edge));
const HIDDEN_KEY = 'pet-hidden';
/** 上方留白：悬停探头时呆毛不被裁掉 */
const HEADROOM = 16;

/** 整个桌宠（含台面）的尺寸，拖动时用来限制在窗口内 */
const BOX_WIDTH = PET_WIDTH + 30;
const BOX_HEIGHT = PET_HEIGHT + PET_BOTTOM + HEADROOM;
/** 左侧留给操作按钮的空间，拖到最左边时按钮也不会出屏 */
const BUTTON_ROOM = 48;
/** 离顶部 / 左边太近时，气泡改到下方、聊天框改到右侧 */
const BUBBLE_ROOM = 150;
const INPUT_ROOM = 320;
/** 按下后移动超过这么多像素才算拖动，否则还是「摸头」 */
const DRAG_THRESHOLD = 5;
const POS_KEY = 'pet-position';

/** 以窗口右下角为原点：离右边、离底边各多少像素 */
interface Pos {
  right: number;
  bottom: number;
}

interface Viewport {
  width: number;
  height: number;
}

const DEFAULT_POS: Pos = { right: 264, bottom: 0 };

const clampPos = (p: Pos, vp: Viewport): Pos => ({
  right: Math.round(Math.min(Math.max(p.right, 0), Math.max(0, vp.width - BOX_WIDTH - BUTTON_ROOM))),
  bottom: Math.round(Math.min(Math.max(p.bottom, 0), Math.max(0, vp.height - BOX_HEIGHT))),
});

const readViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

function readPos(): Pos {
  try {
    const raw = JSON.parse(window.localStorage.getItem(POS_KEY) ?? 'null') as Partial<Pos> | null;
    if (raw && Number.isFinite(raw.right) && Number.isFinite(raw.bottom)) return { right: raw.right!, bottom: raw.bottom! };
  } catch {
    /* 存储不可用或内容损坏时用默认位置 */
  }
  return DEFAULT_POS;
}

function savePos(p: Pos): void {
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* 忽略 */
  }
}

const PET_LINES = ['嗯……被摸头了。', 'Master，请不要一直摸我的头。', '……（呆毛晃了晃）', '这样也不坏。', '骑士的头不是随便摸的……下不为例。'];
const FEED_LINES = ['汉堡！Master 真是体贴。', '唔，好吃……还有吗？', '补给完毕，随时可以出发。', '这份恩情，我会记住的。', '吃饱了才有力气守护这里。'];
const MOVE_LINES = ['这里视野不错。', '要搬家吗？好吧。', '……放下来的时候请轻一点。', '这个位置，我会守好的。'];
const RECALL_LINES = ['我回来了，Master！', '听到召唤了。', '原来你在找我？我一直都在。'];
/** 按时段打招呼：[起始小时, 结束小时（不含）, 台词] */
const GREETINGS: Array<[number, number, string[]]> = [
  [5, 11, ['早上好，Master！今天也要元气满满。', '早安。昨晚睡得好吗？']],
  [11, 14, ['午安，Master。吃过午饭了吗？', '中午了，记得好好吃饭。']],
  [14, 18, ['下午好。要不要来杯热可可？', '下午也请加油，Master。']],
  [18, 23, ['晚上好，Master。今天辛苦了。', '欢迎回来。今晚想看点什么？']],
  [23, 24, ['已经很晚了，Master，早点休息吧。']],
  [0, 5, ['这么晚还没睡吗？Master 要注意身体。', '……深夜了。我陪你，但不许熬太久。']],
];
const SECTION_LINES: Array<[RegExp, string[]]> = [
  [/^\/novel(\/|$)/, ['书架上的书，我都有好好守着。', '要读哪一本？我陪你。']],
  [/^\/music(\/|$)/, ['这首曲子……我很喜欢。', '一起听一会儿吧。']],
  [/^\/anime(\/|$)/, ['Master 最近在追什么番？', '这部我也想看。']],
  [/^\/photowall(\/|$)/, ['这些画都好漂亮。']],
  [/^\/timeline(\/|$)/, ['要找以前的文章吗？我帮你翻翻。']],
  [/^\/moments(\/|$)/, ['这些都是 Master 的日常吗？']],
  [/^\/friends(\/|$)/, ['都是 Master 的朋友吗？真热闹。']],
  [/^\/about(\/|$)/, ['想多了解 Master 一点。']],
];
const ANGRY_LINES = ['Master！适可而止！', '再、再摸我就生气了！', '（呆毛竖了起来）……哼。'];
const WAKE_LINES = ['唔……我、我没睡着！', '嗯？Master 回来了。'];
/** 多久没有任何操作就打瞌睡 */
const DOZE_AFTER = 90_000;
/** 这么短时间里摸这么多下会生气 */
const ANGRY_CLICKS = 5;
const ANGRY_WINDOW = 4000;
const GREETED_KEY = 'pet-greeted';
const SECTIONS_KEY = 'pet-sections';

const IDLE_LINES = ['Master，写累了就休息一下吧。', '今天的樱花也很漂亮。', '这里的书架，我有好好守着。', '……肚子有点饿了。', '有新的文章吗？我想看看。'];

const pick = (lines: readonly string[]): string => lines[Math.floor(Math.random() * lines.length)];

interface ChatReply {
  reply?: unknown;
}

interface Heart {
  id: number;
  x: number;
  symbol: string;
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
  const [dozing, setDozing] = useState(false);
  const [anger, setAnger] = useState(0);
  const pathname = usePathname();
  const dozingRef = useRef(false);
  const clickTimes = useRef<number[]>([]);
  const [pos, setPos] = useState<Pos>(DEFAULT_POS);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [dragging, setDragging] = useState(false);
  /** 被召回时平滑地滑回去（拖动时不能有过渡，所以只在这段时间打开） */
  const [returning, setReturning] = useState(false);
  const speechTimer = useRef<number | undefined>(undefined);
  const heartId = useRef(0);
  const posRef = useRef(pos);
  const drag = useRef<{ id: number; x: number; y: number; from: Pos; moved: boolean } | null>(null);
  /** 刚拖完松手时会顺带触发一次 click，用它把这次 click 吞掉 */
  const suppressClick = useRef(false);

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

  // ---------- 位置：读取上次拖到的地方；窗口变小时挪回可见范围 ----------
  const moveTo = useCallback((p: Pos) => {
    posRef.current = p;
    setPos(p);
  }, []);

  useEffect(() => {
    const vp = readViewport();
    setViewport(vp);
    moveTo(clampPos(readPos(), vp));
    const onResize = () => {
      const next = readViewport();
      setViewport(next);
      moveTo(clampPos(posRef.current, next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [moveTo]);

  // ---------- 听指令：召回 / 说话 ----------
  useEffect(() => {
    let returnTimer: number | undefined;
    const onCommand = (e: Event) => {
      const command = (e as CustomEvent<PetCommand>).detail;
      if (command.type === 'recall') {
        setHidden(false);
        setShowInput(false);
        try {
          window.localStorage.setItem(HIDDEN_KEY, '0');
        } catch {
          /* 忽略 */
        }
        const home = clampPos(DEFAULT_POS, readViewport());
        setReturning(true);
        moveTo(home);
        savePos(home);
        setBounce((b) => b + 1);
        speak(pick(RECALL_LINES), 3000);
        window.clearTimeout(returnTimer);
        returnTimer = window.setTimeout(() => setReturning(false), 700);
      } else if (command.type === 'say') {
        speak(command.text, command.ms);
      }
    };
    window.addEventListener(PET_COMMAND_EVENT, onCommand);
    return () => {
      window.removeEventListener(PET_COMMAND_EVENT, onCommand);
      window.clearTimeout(returnTimer);
    };
  }, [moveTo, speak]);

  // ---------- 打招呼：每次打开网站（同一个标签页）一次 ----------
  useEffect(() => {
    if (hidden) return;
    try {
      if (window.sessionStorage.getItem(GREETED_KEY)) return;
      window.sessionStorage.setItem(GREETED_KEY, '1');
    } catch {
      return;
    }
    const hour = new Date().getHours();
    const lines = GREETINGS.find(([from, to]) => hour >= from && hour < to)?.[2];
    if (!lines) return;
    const timer = window.setTimeout(() => speak(pick(lines), 4500), 2500);
    return () => window.clearTimeout(timer);
    // 只在第一次挂载时检查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 进到不同栏目说不同的话（每次浏览每个栏目一次） ----------
  useEffect(() => {
    if (hidden || !pathname) return;
    const match = SECTION_LINES.find(([re]) => re.test(pathname));
    if (!match) return;
    const key = match[0].source;
    let said: string[] = [];
    try {
      said = JSON.parse(window.sessionStorage.getItem(SECTIONS_KEY) || '[]') as string[];
      if (said.includes(key)) return;
      window.sessionStorage.setItem(SECTIONS_KEY, JSON.stringify([...said, key]));
    } catch {
      return;
    }
    const timer = window.setTimeout(() => speak(pick(match[1]), 3500), 1500);
    return () => window.clearTimeout(timer);
  }, [pathname, hidden, speak]);

  // ---------- 打瞌睡：一段时间没有任何操作；一有动静就醒 ----------
  useEffect(() => {
    if (hidden || reduceMotion) return;
    let last = Date.now();
    const onActivity = () => {
      last = Date.now();
      if (dozingRef.current) {
        dozingRef.current = false;
        setDozing(false);
        if (Math.random() < 0.5) speak(pick(WAKE_LINES), 2500);
      }
    };
    const check = window.setInterval(() => {
      if (!dozingRef.current && Date.now() - last > DOZE_AFTER) {
        dozingRef.current = true;
        setDozing(true);
      }
    }, 5000);
    const events = ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    return () => {
      window.clearInterval(check);
      events.forEach((name) => window.removeEventListener(name, onActivity));
    };
  }, [hidden, reduceMotion, speak]);

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
      if (!speech && !showInput && !thinking && !dozingRef.current && Math.random() > 0.7) speak(pick(IDLE_LINES), 4000);
    }, 25_000);
    return () => window.clearInterval(timer);
  }, [hidden, speech, showInput, thinking, speak]);

  // ---------- 拖动 ----------
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    suppressClick.current = false;
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: posRef.current, moved: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      setDragging(true);
      setShowInput(false);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    moveTo(clampPos({ right: d.from.right - dx, bottom: d.from.bottom - dy }, readViewport()));
  };

  const onPointerEnd = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    setDragging(false);
    savePos(posRef.current);
    if (!hidden) speak(pick(MOVE_LINES), 2600);
  };

  /** 键盘也能挪：方向键 16px，按住 Shift 64px */
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const delta: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const next = clampPos({ right: posRef.current.right + d[0], bottom: posRef.current.bottom + d[1] }, readViewport());
    moveTo(next);
    savePos(next);
  };

  const dragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  };

  // ---------- 交互 ----------
  const pet = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (hidden) {
      setHiddenPersist(false);
      return;
    }
    const now = Date.now();
    clickTimes.current = [...clickTimes.current.filter((t) => now - t < ANGRY_WINDOW), now];
    const angry = clickTimes.current.length >= ANGRY_CLICKS;
    if (angry) {
      clickTimes.current = [];
      setAnger((a) => a + 1);
      speak(pick(ANGRY_LINES), 3000);
    } else {
      setBounce((b) => b + 1);
      speak(pick(PET_LINES), 2600);
    }
    const id = heartId.current++;
    setHearts((hs) => [...hs, { id, x: Math.random() * 60 - 30, symbol: angry ? '💢' : '♥' }]);
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

  // 靠近顶部时气泡放到下方，靠近左边时聊天框放到右侧（挂载前按默认位置渲染，与服务端一致）
  const bubbleBelow = viewport !== null && viewport.height - pos.bottom - BOX_HEIGHT < BUBBLE_ROOM;
  const inputOnRight = viewport !== null && viewport.width - pos.right - BOX_WIDTH < INPUT_ROOM;

  return (
    <div
      className={`group fixed z-[9998] select-none ${returning ? 'transition-[right,bottom] duration-700 ease-out' : ''}`}
      style={{ width: BOX_WIDTH, right: pos.right, bottom: pos.bottom }}
    >
      {/* 💬 气泡 */}
      <div className={`pointer-events-none absolute left-1/2 z-20 flex w-[240px] -translate-x-1/2 justify-center ${bubbleBelow ? 'top-full mt-2' : 'bottom-full'}`}>
        <AnimatePresence>
          {speech && !hidden && (
            <motion.p
              key={speech}
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
              role="status"
              className="relative max-w-[240px] break-words rounded-2xl border border-slate-100 bg-white px-4 py-2.5 text-center text-sm leading-relaxed text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              style={{ transformOrigin: bubbleBelow ? 'top center' : 'bottom center' }}
            >
              {speech}
              <span
                className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800 ${bubbleBelow ? '-top-[6px] border-l border-t' : '-bottom-[6px] border-b border-r'}`}
              />
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
            initial={{ opacity: 0, x: inputOnRight ? -10 : 10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: inputOnRight ? -10 : 10, scale: 0.95 }}
            onSubmit={sendChat}
            className={`absolute ${inputOnRight ? 'left-full ml-3' : 'right-full mr-14'} flex w-60 items-center rounded-full border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800`}
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
          onKeyDown={onKeyDown}
          {...dragHandlers}
          aria-label={hidden ? '叫她出来' : '摸摸头（可拖动，方向键也能挪位置）'}
          title={hidden ? '叫她出来' : '摸摸头 · 按住可以拖动'}
          className={`absolute left-0 touch-none rounded-3xl ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ width: PET_WIDTH, height: PET_HEIGHT, bottom: PET_BOTTOM, transformOrigin: '50% 100%' }}
          animate={{ y: hidden ? PET_HEIGHT * 0.8 : 0, rotate: hidden ? 0 : dragging ? -6 : dozing ? 7 : tilt, scale: dragging ? 1.04 : 1 }}
          whileHover={hidden || reduceMotion || dragging ? undefined : { y: -8 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        >
          {/* 摸头时弹一下（外层，弹簧）；闲置时轻轻呼吸（内层，循环）——弹簧动画不支持多关键帧，所以分两层 */}
          <motion.div
            key={`${bounce}-${anger}`}
            className="h-full w-full"
            style={{ transformOrigin: '50% 100%' }}
            initial={bounce > 0 && !reduceMotion ? { scaleY: 0.9, scaleX: 1.05 } : false}
            animate={anger > 0 && !reduceMotion ? { scaleY: 1, scaleX: 1, x: [0, -7, 7, -5, 5, 0] } : { scaleY: 1, scaleX: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 12, x: { type: 'tween', duration: 0.45 } }}
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

        {/* 打瞌睡：头上冒 Zzz */}
        <AnimatePresence>
          {dozing && !hidden && (
            <motion.span
              key="zzz"
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-2 select-none font-black text-indigo-400"
              initial={{ opacity: 0 }}
              animate={reduceMotion ? { opacity: 0.9 } : { opacity: [0, 1, 0], y: [0, -14], x: [0, 6] }}
              // 退场单独给个过渡，否则会继承下面的无限循环，Zzz 永远消失不了
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: 2.4, repeat: reduceMotion ? 0 : Infinity, ease: 'easeOut' }}
            >
              z<span className="text-lg">Z</span>
            </motion.span>
          )}
        </AnimatePresence>

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
              {h.symbol}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* 台面：一小块毛玻璃；按住台面也能拖动 */}
      <div
        aria-hidden="true"
        {...dragHandlers}
        className={`relative z-0 mx-auto touch-none rounded-t-xl border border-b-0 border-white/50 bg-white/60 shadow-[0_-4px_14px_rgba(15,23,42,0.08)] backdrop-blur-md dark:border-white/10 dark:bg-slate-800/70 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ height: LEDGE_HEIGHT, width: BOX_WIDTH, marginTop: -LEDGE_HEIGHT }}
      />
    </div>
  );
}
