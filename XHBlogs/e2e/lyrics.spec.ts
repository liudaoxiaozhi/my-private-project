// e2e/lyrics.spec.ts —— 歌词解析（lib/lyrics.ts）：译文同行、网易云逐字歌词、按字估算时间
import { test, expect } from '@playwright/test';
import { attachTranslation, buildNeteaseLyrics, isCreditLine, lineEnd, lineTokens, parseLrc, parseYrc } from '../lib/lyrics';

test('LRC：同一时间戳的第二行当作译文，不再单独占一行', () => {
  const lines = parseLrc('[00:01.00]「静寂」と「追憶」の支配が、\n[00:01.00]于寂静与追忆的支配中\n[00:05.50]不意打ちな涙になる。\n[00:05.50]不经意间流下了泪水');
  expect(lines).toEqual([
    { time: 1, text: '「静寂」と「追憶」の支配が、', translation: '于寂静与追忆的支配中' },
    { time: 5.5, text: '不意打ちな涙になる。', translation: '不经意间流下了泪水' },
  ]);
  // 一行多个时间标签、[mm:ss:xx] 写法、纯文本歌词
  expect(parseLrc('[00:01:50][00:03.00]副歌').map((l) => l.time)).toEqual([1.5, 3]);
  expect(parseLrc('[ti:歌名]\n第一行\n第二行')).toEqual([{ time: -1, text: '第一行' }, { time: -1, text: '第二行' }]);
});

test('网易云逐字歌词：每个字的时间，跳过 JSON 署名行；署名从 LRC 补到最前面，翻译挂到对应行', () => {
  const yrc = '{"t":0,"c":[{"tx":"作词: "}]}\n[1000,900](1000,400,0)第(1400,500,0)一句\n[2000,800](2000,800,0)第二句';
  const lines = parseYrc(yrc);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatchObject({ time: 1, end: 1.9, text: '第一句' });
  expect(lines[0].words).toEqual([
    { start: 1, end: 1.4, text: '第' },
    { start: 1.4, end: 1.9, text: '一句' },
  ]);

  const built = buildNeteaseLyrics({ lrc: '[00:00.00]作词 : 测试\n[00:01.00]第一句\n[00:02.00]第二句', yrc, translation: '[00:01.02]first line' });
  expect(built.map((l) => l.text)).toEqual(['作词 : 测试', '第一句', '第二句']);
  expect(built[1].translation).toBe('first line');
  expect(isCreditLine(built[0].text)).toBe(true);

  // 没有逐字歌词时用 LRC
  expect(buildNeteaseLyrics({ lrc: '[00:01.00]只有LRC', yrc: '', translation: '' })).toEqual([{ time: 1, text: '只有LRC' }]);
  // 「//」占位译文不要
  expect(attachTranslation([{ time: 1, text: 'a' }], '[00:01.00]//')[0].translation).toBeUndefined();
});

test('普通 LRC 按字估算时间：逐字递增、覆盖整行，长间奏不会把一个字拖很久', () => {
  const lines = parseLrc('[00:10.00]你好 hello\n[00:40.00]下一句');
  const tokens = lineTokens(lines, 0, 200);
  expect(tokens.map((t) => t.text)).toEqual(['你', '好', ' ', 'hello']);
  expect(tokens[0].start).toBe(10);
  for (let i = 1; i < tokens.length; i++) expect(tokens[i].start).toBeCloseTo(tokens[i - 1].end, 6);
  // 间隔 30 秒，但四个字估算出来远小于 30 秒 → 之后显示间奏
  expect(lineEnd(lines, 0, 200)).toBeLessThan(14);
  // 逐字歌词直接用自己的时间
  const yrcLines = parseYrc('[1000,900](1000,400,0)第(1400,500,0)一句');
  expect(lineTokens(yrcLines, 0, 100)).toBe(yrcLines[0].words);
});
