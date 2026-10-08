// lib/markdown.ts —— 文章 / 杂谈 / 小说共用的 Markdown → HTML 渲染管线（仅服务端 / 构建期运行）
//
// unified、Shiki、KaTeX 等重型依赖只在这里出现，不会进入浏览器 bundle。
// 除标准 Markdown（GFM 表格 / 任务列表 / 脚注、$公式$）外，还支持：
//   提示框 > [!NOTE]、黑幕 ||剧透||（lib/md/remark.ts）
//   代码块标题 / 行号 / 行高亮 / diff / 折叠（lib/md/code.ts）
//   图注与多图网格、表格横向滚动、标题锚点、中英文自动空格（lib/md/rehype.ts）
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

import { remarkArticleSyntax } from './md/remark';
import { rehypeAutoSpace, rehypeFigures, rehypeHeadings, rehypeTableWrap } from './md/rehype';
import type { TocItem } from './md/rehype';
import { rehypeCodeBlocks } from './md/code';
import { countWords } from './content';

export type { TocItem };

export interface RenderOptions {
  /** 代码块未标注语言时补上的默认语言（杂谈沿用旧行为补 cpp；文章不补，交给自动识别） */
  defaultCodeLang?: string;
  /** 标题后加「#」锚点（文章 / 杂谈详情页） */
  headingAnchors?: boolean;
  /** 中文与英文 / 数字之间自动补空格 */
  autoSpace?: boolean;
}

// 围栏只认行首的 ``` / ~~~：正文里随手写的 ``` 不会被当成代码块边界，打乱后面真正代码块的配对
const FENCED_BLOCK = /(^[ \t]*```[\s\S]*?^[ \t]*```|^[ \t]*~~~[\s\S]*?^[ \t]*~~~)/gm;

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
    .replace(/^(\s*\d+)\.([^ \n\d])/gm, '$1. $2');

  return normalized
    .split(FENCED_BLOCK)
    .map((block, index) => {
      // split 带捕获组：奇数下标是代码块，原样保留（仅按需补默认语言）
      if (index % 2 === 1) {
        return defaultCodeLang && /^[ \t]*```[ \t]*(\n|$)/.test(block)
          ? block.replace(/^([ \t]*```)[ \t]*/, '$1' + defaultCodeLang)
          : block;
      }
      // 3 个以上连续换行 = 作者想要额外空行，换成真实 <br>
      return block.replace(/\n{3,}/g, (match) => '\n\n' + '<br>'.repeat(match.length - 2) + '\n\n');
    })
    .join('');
}

async function render(markdown: string, options: RenderOptions, toc?: TocItem[]): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkArticleSyntax)
    // 允许原始 HTML 通过：作者自己写的 <br>、内嵌 HTML 需要保留（内容只来自站长本人）
    .use(remarkRehype, { allowDangerousHtml: true, footnoteLabel: '脚注', footnoteBackLabel: '返回正文' })
    .use(options.autoSpace ? rehypeAutoSpace : () => undefined)
    .use(rehypeHeadings, { anchors: options.headingAnchors, toc })
    .use(rehypeFigures)
    .use(rehypeTableWrap)
    .use(rehypeKatex)
    .use(rehypeCodeBlocks, { defaultLang: options.defaultCodeLang })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(preprocess(markdown, options));

  return String(file);
}

/** 渲染 Markdown 为 HTML 字符串 */
export async function renderMarkdown(markdown: string, options: RenderOptions = {}): Promise<string> {
  return render(markdown, options);
}

export interface RenderedArticle {
  html: string;
  /** 1~3 级标题，id 与正文中的标题 id 一致 */
  toc: TocItem[];
  /** 字数（中文按字、英文按词，不含代码） */
  wordCount: number;
  /** 预计阅读分钟数 */
  readingMinutes: number;
}

/** 每分钟阅读字数（中文按字计） */
const WORDS_PER_MINUTE = 400;

/** 文章 / 杂谈详情页：带标题锚点和中英文空格，并返回目录与字数 */
export async function renderArticle(markdown: string, options: RenderOptions = {}): Promise<RenderedArticle> {
  const toc: TocItem[] = [];
  const html = await render(markdown, { headingAnchors: true, autoSpace: true, ...options }, toc);
  const wordCount = countWords(markdown);
  return { html, toc, wordCount, readingMinutes: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)) };
}
