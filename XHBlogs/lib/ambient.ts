// lib/ambient.ts —— 白噪音 / 环境音：全部在浏览器里用 Web Audio 实时合成，不需要任何音频文件
//
// - 每种声音预先合成一段可以无缝循环的音频（首尾交叉淡化，循环处没有咔哒声），按需生成一次后缓存
// - 可以几种叠着放，各自调音量；和站内音乐播放器互不影响
// - 引擎是模块级单例：关掉工具箱、站内换页都会继续播放；全部停止后挂起 AudioContext，不占 CPU
// - 音量记在浏览器里；不会自动播放（浏览器也不允许），每次都要读者自己点开

export type AmbientId = 'rain' | 'waves' | 'fire' | 'pink' | 'brown';

export const AMBIENT_IDS: readonly AmbientId[] = ['rain', 'waves', 'fire', 'pink', 'brown'];

export interface AmbientState {
  playing: Record<AmbientId, boolean>;
  volume: Record<AmbientId, number>;
}

const VOLUME_KEY = 'ambient-volume';
const DEFAULT_VOLUME = 0.6;
const FADE_SECONDS = 0.8;
/** 循环长度（秒）：海浪要容纳两个完整的浪，其余 8 秒足够听不出重复 */
const LOOP_SECONDS: Record<AmbientId, number> = { rain: 8, waves: 20, fire: 8, pink: 8, brown: 8 };
/** 首尾交叉淡化的长度（秒） */
const SEAM_SECONDS = 0.5;
/** 统一后的平均响度 */
const TARGET_RMS = 0.15;

// ============================== 合成 ==============================

type Synth = (n: number, rate: number, rand: () => number) => Float32Array;

/** 粉噪声（Paul Kellet 滤波）：比白噪声柔和，适合专注 */
const pinkNoise: Synth = (n, _rate, rand) => {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
};

/** 棕噪声（随机游走）：低沉，像远处的瀑布或机舱 */
const brownNoise: Synth = (n, _rate, rand) => {
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02;
    out[i] = last * 3.5;
  }
  return out;
};

/** 在 out 上叠加一个指数衰减的噪声脉冲（雨滴、木柴爆裂） */
function addBurst(out: Float32Array, at: number, length: number, amp: number, rand: () => number, smooth: number): void {
  let prev = 0;
  for (let i = 0; i < length && at + i < out.length; i++) {
    // smooth 越大越闷（简单的一阶低通）
    prev = prev * smooth + (rand() * 2 - 1) * (1 - smooth);
    out[at + i] += prev * amp * Math.exp((-5 * i) / length);
  }
}

/** 雨声：沙沙的底噪 + 密集的细小雨滴 */
const rain: Synth = (n, rate, rand) => {
  const out = pinkNoise(n, rate, rand);
  // 去掉低频，留下「沙沙」声
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const hp = out[i] - prev;
    prev = out[i];
    out[i] = hp * 1.6;
  }
  const drops = Math.round((n / rate) * 60);
  for (let d = 0; d < drops; d++) {
    addBurst(out, Math.floor(rand() * n), Math.floor(rate * (0.004 + rand() * 0.012)), 0.08 + rand() * 0.22, rand, 0.2);
  }
  return out;
};

/** 海浪：棕噪声 + 粉噪声，音量按「涨潮—退潮」的节奏起伏 */
const waves: Synth = (n, rate, rand) => {
  const deep = brownNoise(n, rate, rand);
  const foam = pinkNoise(n, rate, rand);
  const out = new Float32Array(n);
  const period = n / 2; // 一个循环里两个浪
  for (let i = 0; i < n; i++) {
    const phase = (i % period) / period;
    // 涨得慢、退得快一点的不对称包络
    const swell = phase < 0.6 ? Math.sin((phase / 0.6) * (Math.PI / 2)) : Math.cos(((phase - 0.6) / 0.4) * (Math.PI / 2));
    const env = 0.12 + 0.88 * swell * swell;
    out[i] = deep[i] * (0.35 + 0.65 * env) * 0.8 + foam[i] * env * env * 0.7;
  }
  return out;
};

/** 篝火：低沉的燃烧声 + 不规则的噼啪爆裂 */
const fire: Synth = (n, rate, rand) => {
  const out = brownNoise(n, rate, rand);
  for (let i = 0; i < n; i++) out[i] *= 0.7;
  let t = 0;
  while (t < n) {
    // 爆裂声成簇出现：一簇 1~4 下，簇之间间隔不定
    const cluster = 1 + Math.floor(rand() * 4);
    for (let c = 0; c < cluster; c++) {
      addBurst(out, t + Math.floor(rand() * rate * 0.08), Math.floor(rate * (0.002 + rand() * 0.006)), 0.25 + rand() * 0.6, rand, 0.05);
    }
    t += Math.floor(rate * (0.08 + rand() * 0.5));
  }
  return out;
};

const SYNTHS: Record<AmbientId, Synth> = { rain, waves, fire, pink: pinkNoise, brown: brownNoise };

/** 固定种子的伪随机数：同一种声音每次合成结果一样 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 合成 n + seam 个采样，再把尾部交叉淡化到开头，得到首尾相接的循环 */
function renderLoop(id: AmbientId, ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(LOOP_SECONDS[id] * rate);
  const seam = Math.floor(SEAM_SECONDS * rate);
  const raw = SYNTHS[id](n + seam, rate, seeded(AMBIENT_IDS.indexOf(id) + 1));
  const buffer = ctx.createBuffer(1, n, rate);
  const data = buffer.getChannelData(0);
  let peak = 0;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const v = i < seam ? raw[i] * (i / seam) + raw[n + i] * (1 - i / seam) : raw[i];
    data[i] = v;
    peak = Math.max(peak, Math.abs(v));
    energy += v * v;
  }
  // 按平均响度（RMS）统一音量，避免切换声音时忽大忽小；同时保证峰值不削波
  const rms = Math.sqrt(energy / n);
  const gain = rms > 0 ? Math.min(TARGET_RMS / rms, 0.95 / peak) : 1;
  for (let i = 0; i < n; i++) data[i] *= gain;
  return buffer;
}

// ============================== 引擎 ==============================

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

let ctx: AudioContext | null = null;
/** 所有声音先汇到这里：压限器防止几种声音叠在一起时爆音 */
let master: AudioNode | null = null;
const buffers = new Map<AmbientId, AudioBuffer>();
const voices = new Map<AmbientId, Voice>();
/** 正在启动中的声音（等 AudioContext 恢复期间），防止连点两下启动两份 */
const starting = new Set<AmbientId>();
const listeners = new Set<() => void>();

function loadVolumes(): Record<AmbientId, number> {
  const volume = Object.fromEntries(AMBIENT_IDS.map((id) => [id, DEFAULT_VOLUME])) as Record<AmbientId, number>;
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) || 'null') as Partial<Record<AmbientId, number>> | null;
    for (const id of AMBIENT_IDS) {
      const v = saved?.[id];
      if (typeof v === 'number' && v >= 0 && v <= 1) volume[id] = v;
    }
  } catch {
    /* 存储不可用时用默认音量 */
  }
  return volume;
}

let state: AmbientState | null = null;
const SERVER_STATE: AmbientState = {
  playing: { rain: false, waves: false, fire: false, pink: false, brown: false },
  volume: { rain: DEFAULT_VOLUME, waves: DEFAULT_VOLUME, fire: DEFAULT_VOLUME, pink: DEFAULT_VOLUME, brown: DEFAULT_VOLUME },
};

function setState(next: AmbientState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

export function getAmbientState(): AmbientState {
  state ??= { playing: { ...SERVER_STATE.playing }, volume: loadVolumes() };
  return state;
}

export const getServerAmbientState = (): AmbientState => SERVER_STATE;

export function subscribeAmbient(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.ratio.value = 4;
    compressor.connect(ctx.destination);
    master = compressor;
  }
  return ctx;
}

/** 滑块是线性的，人耳对音量的感受不是：平方一下，小音量那一段更好调 */
const toGain = (volume: number): number => volume * volume;

export async function startAmbient(id: AmbientId): Promise<void> {
  if (voices.has(id) || starting.has(id)) return;
  starting.add(id);
  const ac = audio();
  try {
    if (ac.state === 'suspended') await ac.resume();
  } finally {
    starting.delete(id);
  }
  let buffer = buffers.get(id);
  if (!buffer) {
    buffer = renderLoop(id, ac);
    buffers.set(id, buffer);
  }
  const current = getAmbientState();
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(toGain(current.volume[id]), ac.currentTime, FADE_SECONDS / 3);
  source.connect(gain).connect(master ?? ac.destination);
  source.start();
  voices.set(id, { source, gain });
  setState({ ...current, playing: { ...current.playing, [id]: true } });
}

export function stopAmbient(id: AmbientId): void {
  const voice = voices.get(id);
  if (!voice || !ctx) return;
  voices.delete(id);
  const ac = ctx;
  voice.gain.gain.setTargetAtTime(0, ac.currentTime, FADE_SECONDS / 3);
  voice.source.stop(ac.currentTime + FADE_SECONDS * 1.5);
  voice.source.onended = () => {
    voice.gain.disconnect();
    if (voices.size === 0 && ac.state === 'running') void ac.suspend();
  };
  const current = getAmbientState();
  setState({ ...current, playing: { ...current.playing, [id]: false } });
}

export function toggleAmbient(id: AmbientId): void {
  if (voices.has(id)) stopAmbient(id);
  else void startAmbient(id);
}

export function stopAllAmbient(): void {
  for (const id of [...voices.keys()]) stopAmbient(id);
}

export function setAmbientVolume(id: AmbientId, value: number): void {
  const v = Math.min(1, Math.max(0, value));
  const voice = voices.get(id);
  if (voice && ctx) voice.gain.gain.setTargetAtTime(toGain(v), ctx.currentTime, 0.05);
  const current = getAmbientState();
  const next = { ...current, volume: { ...current.volume, [id]: v } };
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(next.volume));
  } catch {
    /* 忽略 */
  }
  setState(next);
}
