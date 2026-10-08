// lib/md/code.ts —— 代码块：构建期用 Shiki 高亮（浏览器端零高亮脚本），日夜两套配色
//
// 写法（都写在 ``` 后面的那一行）：
//   ```ts title="app/page.tsx"     文件名标题（也可以写成 ```ts:app/page.tsx）
//   ```ts {2,5-7}                  高亮指定行
//   ```ts /useState/               高亮指定单词
//   ```ts showLineNumbers          强制显示行号（默认 5 行及以上才显示）；noLineNumbers 关闭
//   ```ts collapse                 强制折叠；nocollapse 不折叠（默认超过 25 行自动折叠）
// 代码里的注释标记（渲染时会去掉注释本身）：
//   // [!code ++]  // [!code --]  新增 / 删除行
//   // [!code highlight]          高亮这一行
//   // [!code focus]              聚焦这一行（其余行变淡，悬停恢复）
//   // [!code error]  // [!code warning]
// ```diff 代码块里以 + / - 开头的行也会自动标成新增 / 删除。
import type { Element, ElementContent, Root } from 'hast';
import hljs from 'highlight.js/lib/common';
import { bundledLanguages, createHighlighter } from 'shiki';
import type { BundledLanguage, Highlighter, ShikiTransformer } from 'shiki';
import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers';

const THEMES = { light: 'github-light', dark: 'one-dark-pro' } as const;

/** 未标注语言时，用 highlight.js 猜语言的候选范围（与旧版一致） */
const DETECT_LANGUAGES = ['cpp', 'c', 'python', 'java', 'javascript', 'typescript', 'go', 'rust', 'bash', 'json', 'xml', 'css', 'sql'];
const DETECT_MIN_RELEVANCE = 5;

const PLAIN_LANGS = new Set(['text', 'txt', 'plain', 'plaintext']);

const LINE_NUMBERS_FROM = 5;
const COLLAPSE_AFTER = 25;

const DISPLAY_NAMES: Record<string, string> = {
  ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX', js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX',
  py: 'Python', python: 'Python', cpp: 'C++', 'c++': 'C++', c: 'C', cs: 'C#', csharp: 'C#', java: 'Java', go: 'Go',
  rs: 'Rust', rust: 'Rust', kt: 'Kotlin', kotlin: 'Kotlin', swift: 'Swift', php: 'PHP', rb: 'Ruby', ruby: 'Ruby',
  sh: 'Shell', bash: 'Bash', zsh: 'Zsh', shell: 'Shell', powershell: 'PowerShell', ps1: 'PowerShell', bat: 'Batch',
  json: 'JSON', jsonc: 'JSONC', yaml: 'YAML', yml: 'YAML', toml: 'TOML', ini: 'INI', xml: 'XML', html: 'HTML',
  css: 'CSS', scss: 'SCSS', vue: 'Vue', sql: 'SQL', md: 'Markdown', markdown: 'Markdown', diff: 'Diff',
  dockerfile: 'Dockerfile', docker: 'Dockerfile', lua: 'Lua', text: 'Text',
};

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: [] });
  return highlighterPromise;
}

/** 返回 Shiki 能用的语言名；不认识的语言按纯文本处理 */
async function loadLanguage(highlighter: Highlighter, lang: string): Promise<string> {
  if (!lang || PLAIN_LANGS.has(lang) || !(lang in bundledLanguages)) return 'text';
  await highlighter.loadLanguage(lang as BundledLanguage);
  return lang;
}

function detectLanguage(code: string): string {
  const result = hljs.highlightAuto(code, DETECT_LANGUAGES);
  return result.language && result.relevance >= DETECT_MIN_RELEVANCE ? result.language : 'text';
}

interface CodeMeta {
  title: string;
  lineNumbers: boolean | null;
  collapse: boolean | null;
}

function parseMeta(meta: string): CodeMeta {
  const title = /\b(?:title|filename|file)=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
  return {
    title: title ? (title[1] ?? title[2] ?? title[3] ?? '').trim() : '',
    lineNumbers: /\bno-?line-?numbers\b|\bnoln\b/i.test(meta) ? false : /\bshow-?line-?numbers\b|\bln\b/i.test(meta) ? true : null,
    collapse: /\bno-?collapse\b/i.test(meta) ? false : /\bcollapse\b/i.test(meta) ? true : null,
  };
}

/** ```diff 里以 + / - 开头的行标成新增 / 删除 */
function diffLines(lines: string[]): ShikiTransformer {
  return {
    name: 'xh:diff-lines',
    pre(node) {
      this.addClassToHast(node, 'has-diff');
    },
    line(node, line) {
      const first = lines[line - 1]?.[0];
      if (first === '+') this.addClassToHast(node, ['diff', 'add']);
      else if (first === '-') this.addClassToHast(node, ['diff', 'remove']);
    },
  };
}

function el(tagName: string, properties: Element['properties'], children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children };
}

const text = (value: string): ElementContent => ({ type: 'text', value });

function classList(node: Element): string[] {
  const value = node.properties?.className;
  return Array.isArray(value) ? value.map(String) : [];
}

interface CodeTarget {
  parent: Root | Element;
  index: number;
  code: Element;
}

function collectCodeBlocks(node: Root | Element, out: CodeTarget[]): void {
  node.children.forEach((child, index) => {
    if (child.type !== 'element') return;
    const code = child.children.find((c): c is Element => c.type === 'element');
    if (child.tagName === 'pre' && code?.tagName === 'code' && !classList(code).includes('language-math')) {
      out.push({ parent: node, index, code });
      return;
    }
    collectCodeBlocks(child, out);
  });
}

export interface CodeBlockOptions {
  /** 未标注语言时使用的语言；不填则自动识别 */
  defaultLang?: string;
}

async function renderBlock(highlighter: Highlighter, codeEl: Element, defaultLang?: string): Promise<Element> {
  const raw = codeEl.children.map((c) => (c.type === 'text' ? c.value : '')).join('').replace(/\n$/, '');
  const meta = String((codeEl.data as { meta?: string } | undefined)?.meta ?? '');
  const langClass = classList(codeEl).find((c) => c.startsWith('language-'));
  const [langPart, colonTitle = ''] = (langClass?.slice('language-'.length) ?? '').split(/:([\s\S]*)/);

  const requested = (langPart || defaultLang || detectLanguage(raw)).toLowerCase();
  const lang = await loadLanguage(highlighter, requested);
  const { title: metaTitle, lineNumbers, collapse } = parseMeta(meta);
  const title = metaTitle || colonTitle.trim();
  const lines = raw.split('\n');

  const transformers: ShikiTransformer[] = [
    transformerNotationDiff({ matchAlgorithm: 'v3' }),
    transformerNotationHighlight({ matchAlgorithm: 'v3' }),
    transformerNotationFocus({ matchAlgorithm: 'v3' }),
    transformerNotationErrorLevel({ matchAlgorithm: 'v3' }),
    transformerMetaHighlight(),
    transformerMetaWordHighlight(),
  ];
  if (lang === 'diff') transformers.push(diffLines(lines));

  const hast = highlighter.codeToHast(raw, { lang, themes: THEMES, transformers, meta: { __raw: meta } });
  const pre = hast.children[0] as Element;
  const code = pre.children.find((c): c is Element => c.type === 'element');
  // 行与行之间的换行符去掉，改由 CSS 让每行独占一行（高亮整行背景、行号都依赖这一点）
  if (code) code.children = code.children.filter((c) => !(c.type === 'text' && c.value === '\n'));

  const lineCount = lines.length;
  const showNumbers = lineNumbers ?? lineCount >= LINE_NUMBERS_FROM;
  const collapsible = collapse ?? lineCount > COLLAPSE_AFTER;
  const langName = DISPLAY_NAMES[requested] ?? DISPLAY_NAMES[lang] ?? (lang === 'text' ? 'Text' : requested.toUpperCase());

  const header = el('div', { className: ['code-header'] }, [
    el('span', { className: ['code-dots'], ariaHidden: 'true' }),
    el('span', { className: ['code-title'] }, [text(title || langName)]),
    ...(title ? [el('span', { className: ['code-lang'] }, [text(langName)])] : []),
    el('button', { type: 'button', className: ['code-copy'], ariaLabel: '复制代码' }, [text('复制')]),
  ]);

  const children: ElementContent[] = [header, pre];
  if (collapsible) {
    children.push(
      el('button', { type: 'button', className: ['code-expand'], ariaExpanded: 'false', dataLines: String(lineCount) }, [
        text(`展开全部 ${lineCount} 行`),
      ]),
    );
  }

  const className = ['code-block'];
  if (showNumbers) className.push('line-numbers');
  if (collapsible) className.push('is-collapsible', 'is-collapsed');
  return el('figure', { className, dataLang: lang }, children);
}

export function rehypeCodeBlocks({ defaultLang }: CodeBlockOptions = {}) {
  return async (tree: Root) => {
    const targets: CodeTarget[] = [];
    collectCodeBlocks(tree, targets);
    if (targets.length === 0) return;

    const highlighter = await getHighlighter();
    for (const { parent, index, code } of targets) {
      parent.children[index] = await renderBlock(highlighter, code, defaultLang);
    }
  };
}
