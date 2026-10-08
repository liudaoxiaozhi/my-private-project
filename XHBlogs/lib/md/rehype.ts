// lib/md/rehype.ts —— 作用在 HTML 语法树（hast）上的自定义扩展（构建期运行）
//
// - rehypeHeadings：标题 id 在构建时生成（直接打开 #小节 链接也能跳到），重名自动加 -1、-2；
//   可选在标题后面加「#」锚点；同时收集 1~3 级标题作为目录
// - rehypeFigures：单独一行的图片变成 <figure>（有说明文字时带图注），连续多张图排成网格
// - rehypeTableWrap：表格外包一层可横向滚动的容器，手机上不再撑破页面
// - rehypeAutoSpace：中文与英文 / 数字之间自动补空格（代码、公式不动）
import type { Element, ElementContent, Root, RootContent, Text } from 'hast';

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

type HastParent = Root | Element;

function isElement(node: RootContent | Root | undefined, tagName?: string): node is Element {
  return node?.type === 'element' && (tagName === undefined || node.tagName === tagName);
}

function classList(node: Element): string[] {
  const value = node.properties?.className;
  return Array.isArray(value) ? value.map(String) : [];
}

export function textContent(node: RootContent | Root): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map((c) => textContent(c as RootContent)).join('');
  return '';
}

function visitElements(node: HastParent, fn: (el: Element, parent: HastParent, index: number) => void): void {
  node.children.forEach((child, index) => {
    if (child.type !== 'element') return;
    fn(child, node, index);
    visitElements(child, fn);
  });
}

// ============================== 标题 ==============================

const HEADING = /^h([1-6])$/;

/** 保留各国文字、字母和数字，其余字符折叠成连字符 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export interface HeadingOptions {
  /** 在标题末尾加「#」锚点链接 */
  anchors?: boolean;
  /** 收集到的目录写到这里 */
  toc?: TocItem[];
}

export function rehypeHeadings({ anchors = false, toc }: HeadingOptions = {}) {
  return (tree: Root) => {
    const used = new Map<string, number>();
    visitElements(tree, (el) => {
      const match = HEADING.exec(el.tagName);
      // 已有 id 的标题（例如自动生成的「脚注」标题）不处理
      if (!match || el.properties?.id) return;

      const text = textContent(el).trim();
      const base = slugify(text) || 'section';
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      const id = seen === 0 ? base : `${base}-${seen}`;
      el.properties = { ...el.properties, id };

      const level = Number(match[1]);
      if (toc && level <= 3 && text) toc.push({ level, text, id });

      if (anchors) {
        el.children.push({
          type: 'element',
          tagName: 'a',
          properties: { className: ['heading-anchor'], href: `#${id}`, ariaLabel: `复制「${text}」的链接` },
          children: [{ type: 'text', value: '#' }],
        });
      }
    });
  };
}

// ============================== 图片 ==============================

const FILENAME_LIKE = /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i;
const GENERIC_ALT = new Set(['image', 'img', 'picture', 'photo', '图片', '图', '截图']);

function captionOf(img: Element): string {
  const title = String(img.properties?.title ?? '').trim();
  if (title) return title;
  const alt = String(img.properties?.alt ?? '').trim();
  if (!alt || FILENAME_LIKE.test(alt) || GENERIC_ALT.has(alt.toLowerCase())) return '';
  return alt;
}

function toFigure(img: Element): Element {
  const caption = captionOf(img);
  const children: ElementContent[] = [img];
  if (caption) {
    children.push({ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: caption }] });
  }
  return { type: 'element', tagName: 'figure', properties: { className: ['article-figure'] }, children };
}

const isBlank = (node: ElementContent): boolean =>
  (node.type === 'text' && node.value.trim() === '') || isElement(node as RootContent, 'br');

export function rehypeFigures() {
  return (tree: Root) => {
    visitElements(tree, (el) => {
      if (el.tagName === 'img') {
        el.properties = { loading: 'lazy', decoding: 'async', ...el.properties };
      }
    });

    visitElements(tree, (el, parent, index) => {
      if (el.tagName !== 'p') return;
      const content = el.children.filter((c) => !isBlank(c));
      if (content.length === 0 || !content.every((c) => isElement(c as RootContent, 'img'))) return;

      const images = content as Element[];
      const replacement: Element =
        images.length === 1
          ? toFigure(images[0])
          : {
              type: 'element',
              tagName: 'div',
              properties: { className: ['image-grid'], dataCount: String(Math.min(images.length, 4)) },
              children: images.map(toFigure),
            };
      parent.children[index] = replacement;
    });
  };
}

// ============================== 表格 ==============================

export function rehypeTableWrap() {
  return (tree: Root) => {
    visitElements(tree, (el, parent, index) => {
      if (el.tagName !== 'table' || (isElement(parent as RootContent) && classList(parent as Element).includes('table-wrap'))) return;
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-wrap'] },
        children: [el],
      };
    });
  };
}

// ============================== 中英文间距 ==============================

const CJK = '\\u2e80-\\u2eff\\u2f00-\\u2fdf\\u3040-\\u309f\\u30a0-\\u30fa\\u30fc-\\u30ff\\u3100-\\u312f\\u3200-\\u32ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff';
const LATIN = 'A-Za-z0-9';
const CJK_THEN_LATIN = new RegExp(`([${CJK}])([${LATIN}])`, 'g');
const LATIN_THEN_CJK = new RegExp(`([${LATIN}])([${CJK}])`, 'g');
const IS_CJK = new RegExp(`[${CJK}]`);
const IS_LATIN = new RegExp(`[${LATIN}]`);

/** 这些元素里的文字原样保留 */
const NO_SPACE_TAGS = new Set(['pre', 'code', 'kbd', 'samp', 'script', 'style', 'math', 'svg', 'textarea']);
/** 两侧可以补空格的行内元素（上下标、脚注角标紧贴正文，不在此列） */
const INLINE_TAGS = new Set(['a', 'strong', 'em', 'b', 'i', 'del', 's', 'u', 'mark', 'span', 'code', 'abbr']);

export function addCjkSpacing(text: string): string {
  return text.replace(CJK_THEN_LATIN, '$1 $2').replace(LATIN_THEN_CJK, '$1 $2');
}

/** 行内元素首 / 尾字符的类别：cjk、latin（行内代码与公式视为 latin）或 null */
function edgeKind(node: ElementContent, edge: 'start' | 'end'): 'cjk' | 'latin' | null {
  if (node.type === 'element') {
    if (node.tagName === 'code') return 'latin';
    if (!INLINE_TAGS.has(node.tagName)) return null;
  } else if (node.type !== 'text') {
    return null;
  }
  const text = textContent(node as RootContent);
  const ch = edge === 'start' ? text[0] : text[text.length - 1];
  if (!ch) return null;
  if (IS_CJK.test(ch)) return 'cjk';
  if (IS_LATIN.test(ch)) return 'latin';
  return null;
}

function spaceChildren(parent: HastParent): void {
  if (isElement(parent as RootContent) && NO_SPACE_TAGS.has((parent as Element).tagName)) return;

  for (const child of parent.children) {
    if (child.type === 'text') child.value = addCjkSpacing(child.value);
    else if (child.type === 'element') spaceChildren(child);
  }

  // 跨元素边界：「使用<strong>React</strong>」→「使用 <strong>React</strong>」
  const children = parent.children as ElementContent[];
  for (let i = children.length - 1; i > 0; i--) {
    const prev = children[i - 1];
    const next = children[i];
    if (prev.type !== 'element' && next.type !== 'element') continue;
    const a = edgeKind(prev, 'end');
    const b = edgeKind(next, 'start');
    if (!a || !b || a === b) continue;
    if (prev.type === 'text') prev.value += ' ';
    else if (next.type === 'text') next.value = ' ' + next.value;
    else children.splice(i, 0, { type: 'text', value: ' ' } satisfies Text);
  }
}

export function rehypeAutoSpace() {
  return (tree: Root) => {
    spaceChildren(tree);
  };
}
