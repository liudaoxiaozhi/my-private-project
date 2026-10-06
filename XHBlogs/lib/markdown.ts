// lib/markdown.ts —— 文章 / 杂谈共用的 Markdown → HTML 渲染管线（仅服务端 / 构建期运行）
//
// unified、highlight.js、KaTeX 等重型依赖只在这里出现，不会进入浏览器 bundle。
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export interface RenderOptions {
  /** 代码块未标注语言时补上的默认语言（杂谈沿用旧行为补 cpp；文章不补，交给自动识别） */
  defaultCodeLang?: string;
}

const HIGHLIGHT_LANGUAGES = [
  'cpp', 'c', 'python', 'java', 'javascript', 'typescript', 'go', 'rust',
  'bash', 'json', 'html', 'css', 'sql', 'xml',
];

const FENCED_BLOCK = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;

/**
 * 渲染前清洗（合并了旧版文章页与杂谈页各自的补丁）：
 * 1. 统一换行、去零宽字符、清掉只有空白的行
 * 2. 修复「1.内容」缺空格导致列表失效
 * 3. 保留作者刻意留的多个空行（转成 <br>），代码块内不处理
 */
function preprocess(markdown: string, { defaultCodeLang }: RenderOptions): string {
  const normalized = markdown
    .replace(/\r\n/g, '\n')
    .replace(/[​-‍﻿]/g, '')
    .replace(/^[ \t]+$/gm, '')
    .replace(/^(\s*\d+)\.([^ \n])/gm, '$1. $2');

  return normalized
    .split(FENCED_BLOCK)
    .map((block, index) => {
      // split 带捕获组：奇数下标是代码块，原样保留（仅按需补默认语言）
      if (index % 2 === 1) {
        return defaultCodeLang && /^```[ \t]*(\n|$)/.test(block)
          ? block.replace(/^```[ \t]*/, '```' + defaultCodeLang)
          : block;
      }
      // 3 个以上连续换行 = 作者想要额外空行，换成真实 <br>
      return block.replace(/\n{3,}/g, (match) => '\n\n' + '<br>'.repeat(match.length - 2) + '\n\n');
    })
    .join('');
}

/** 渲染 Markdown 为 HTML 字符串 */
export async function renderMarkdown(markdown: string, options: RenderOptions = {}): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    // 允许原始 HTML 通过：作者自己写的 <br>、内嵌 HTML 需要保留（内容只来自站长本人）
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeHighlight, { detect: true, subset: HIGHLIGHT_LANGUAGES })
    .use(rehypeKatex)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(preprocess(markdown, options));

  return String(file);
}

/**
 * 从 Markdown 提取 1~3 级标题作为目录。
 * id 仅作 React key 使用；正文标题的真实 id 由 ClientTOC 在客户端按同一规则统一生成。
 */
export function extractToc(markdown: string): TocItem[] {
  const withoutCode = markdown.replace(FENCED_BLOCK, '');
  const toc: TocItem[] = [];
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(withoutCode)) !== null) {
    const text = match[2].trim();
    toc.push({ level: match[1].length, text, id: text.toLowerCase().replace(/\s+/g, '-') });
  }
  return toc;
}
