// lib/lyrics.ts —— 歌词解析（纯函数，前后端通用）
//
// - parseLrc：普通 LRC；同一时间戳的连续两行合并成「原文 + 译文」，不再各占一行
// - parseYrc：网易云逐字歌词「[行开始,行时长](字开始,字时长,0)字…」，时间单位毫秒
// - buildNeteaseLyrics：有逐字歌词用逐字，没有就用 LRC；再把翻译挂到对应行
// - lineTokens：给没有逐字时间的行按字估算时间，让当前行也能逐字推进
import type { LyricLine, LyricWord, NeteaseLyricPayload } from './music';

const CONTROL = /[\u0000-\u001F\u007F-\u009F​-‍﻿]/g;
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** 两行时间差小于这个值（秒）就算同一时间戳 */
const SAME_TIME = 0.01;

/** 「作词 : xxx」「编曲：xxx」这类署名行，页面上显示得小一些、淡一些 */
const CREDIT = /^\s*(作词|作曲|编曲|词|曲|制作人|制作|监制|混音|母带|和声|合声|录音|吉他|贝斯|鼓|键盘|弦乐|配唱|出品|发行|企划|OP|SP|Lyrics?|Composer|Arranger|Producer|Mix(?:ing)?|Master(?:ing)?)\s*[:：]/i;
export const isCreditLine = (text: string) => CREDIT.test(text);

/** 解析带时间标签的 LRC 行，不合并（翻译歌词也用它） */
function parseStamped(lrcText: string): LyricLine[] {
  const result: LyricLine[] = [];
  for (const line of lrcText.split(/\r?\n/)) {
    const matches = [...line.matchAll(STAMP)];
    if (matches.length === 0) continue;
    const text = line.replace(STAMP, '').replace(CONTROL, '').trim();
    if (!text) continue;
    for (const match of matches) {
      // 小数部分按位数换算：.5 = 0.5 秒，.50 = 0.5 秒，.500 = 0.5 秒
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      result.push({ time: parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + fraction, text });
    }
  }
  // sort 是稳定的：同一时间戳的行保持文件里的先后（原文在前、译文在后）
  return result.sort((a, b) => a.time - b.time);
}

/**
 * LRC 歌词。兼容 [mm:ss]、[mm:ss.xx]、[mm:ss:xx]，一行多个时间标签；
 * 同一时间戳的第二行起当作译文；没有任何时间标签时按纯文本歌词处理（time = -1）
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText || lrcText.length > 60000) return [];
  const stamped = parseStamped(lrcText);
  if (stamped.length > 0) {
    const merged: LyricLine[] = [];
    for (const line of stamped) {
      const prev = merged[merged.length - 1];
      if (prev && Math.abs(prev.time - line.time) < SAME_TIME) {
        prev.translation = prev.translation ? `${prev.translation} / ${line.text}` : line.text;
      } else {
        merged.push({ ...line });
      }
    }
    return merged;
  }
  return lrcText
    .split(/\r?\n/)
    .map((l) => l.replace(CONTROL, '').trim())
    // 去掉 [ar:歌手]、[ti:歌名] 这类 LRC 信息标签
    .filter((l) => l && !/^\[[a-z]+:.*\]$/i.test(l))
    .map((text) => ({ time: -1, text }));
}

/** 网易云逐字歌词（yrc）。以「{」开头的是 JSON 格式的署名行，跳过 */
export function parseYrc(yrcText: string): LyricLine[] {
  if (!yrcText || yrcText.length > 200000) return [];
  const lines: LyricLine[] = [];
  for (const raw of yrcText.split(/\r?\n/)) {
    const head = /^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());
    if (!head) continue;
    const words: LyricWord[] = [];
    for (const m of head[3].matchAll(/\((\d+),(\d+),-?\d+\)([^(]*)/g)) {
      const text = m[3].replace(CONTROL, '');
      if (!text) continue;
      const start = Number(m[1]) / 1000;
      words.push({ start, end: start + Number(m[2]) / 1000, text });
    }
    const text = words.map((w) => w.text).join('').trim();
    if (!text) continue;
    const time = Number(head[1]) / 1000;
    lines.push({ time, end: time + Number(head[2]) / 1000, text, words });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** 把翻译歌词（LRC）挂到时间最接近的行上（逐字歌词的行时间和 LRC 可能差零点几秒） */
export function attachTranslation(lines: LyricLine[], translationLrc: string, tolerance = 1): LyricLine[] {
  const translated = parseStamped(translationLrc);
  if (translated.length === 0 || lines.length === 0) return lines;
  const result = lines.map((l) => ({ ...l }));
  for (const t of translated) {
    let best = -1;
    let bestGap = tolerance;
    for (let i = 0; i < result.length; i++) {
      const gap = Math.abs(result[i].time - t.time);
      if (gap <= bestGap && !result[i].translation) {
        best = i;
        bestGap = gap;
      }
    }
    // 「//」之类的占位译文不要
    if (best >= 0 && !/^[\s/\\-]*$/.test(t.text)) result[best].translation = t.text;
  }
  return result;
}

/** /api/music/lyric 的结果 → 歌词行：优先逐字歌词，署名行从 LRC 里补到最前面 */
export function buildNeteaseLyrics(payload: Partial<NeteaseLyricPayload>): LyricLine[] {
  const lrcLines = parseLrc(payload.lrc ?? '');
  const yrcLines = parseYrc(payload.yrc ?? '');
  let lines: LyricLine[];
  if (yrcLines.length > 0) {
    const first = yrcLines[0].time;
    const credits = lrcLines.filter((l) => l.time >= 0 && l.time < first && isCreditLine(l.text));
    lines = [...credits, ...yrcLines];
  } else {
    lines = lrcLines;
  }
  return payload.translation ? attachTranslation(lines, payload.translation) : lines;
}

/** 估算唱一个片段的「份量」：中日韩文字一份，英文单词按字母数的一半，空格、标点很少 */
// 用 new RegExp：tsconfig 的编译目标是 ES2017，正则字面量里不能写 \p{…} 和 s 标志（浏览器都支持）
const PUNCT = new RegExp('^[\\p{P}\\p{S}]+$', 'u');
const LATIN_WORD = new RegExp("^[\\p{Script=Latin}\\p{N}'’]+$", 'u');
const TOKEN = new RegExp("[\\p{Script=Latin}\\p{N}'’]+|\\s+|[\\s\\S]", 'gu');

function weightOf(token: string): number {
  if (/^\s+$/.test(token)) return 0.15;
  if (PUNCT.test(token)) return 0.25;
  if (LATIN_WORD.test(token)) return Math.max(1, token.length * 0.5);
  return 1;
}

/** 把一行拆成片段：中日韩文字逐字，连续的英文 / 数字算一个单词，空格单独一段 */
function splitTokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/**
 * 当前行的逐字时间。逐字歌词直接用；普通 LRC 按「份量」把这一行的演唱时长分给每个字：
 * 时长取到下一行的间隔，但不超过按字数估计的长度（长间奏时不会一个字拖十几秒）
 */
export function lineTokens(lines: LyricLine[], index: number, duration: number): LyricWord[] {
  const line = lines[index];
  if (!line || line.time < 0) return [];
  if (line.words && line.words.length > 0) return line.words;
  const tokens = splitTokens(line.text);
  const weights = tokens.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const next = lines[index + 1]?.time;
  const gap = next !== undefined && next > line.time ? next - line.time : duration > line.time ? duration - line.time : 5;
  const span = Math.max(0.6, Math.min(gap * 0.92, total * 0.42 + 0.8));
  let cursor = line.time;
  return tokens.map((text, i) => {
    const start = cursor;
    cursor += (weights[i] / total) * span;
    return { start, end: cursor, text };
  });
}

/** 这一行唱完的时间：逐字歌词有明确的结束；普通 LRC 用估算的最后一个字 */
export function lineEnd(lines: LyricLine[], index: number, duration: number): number {
  const line = lines[index];
  if (line?.end !== undefined) return line.end;
  const tokens = lineTokens(lines, index, duration);
  return tokens.length > 0 ? tokens[tokens.length - 1].end : (line?.time ?? 0);
}
