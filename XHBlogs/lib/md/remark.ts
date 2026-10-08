// lib/md/remark.ts —— 作用在 Markdown 语法树（mdast）上的自定义扩展
//
// 1. 提示框：GitHub 风格的 > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
//    - 标记后面可以跟自定义标题：> [!TIP] 小技巧
//    - 标记后加 - / + 变成可折叠的提示框（- 默认收起，+ 默认展开）：> [!NOTE]- 点击展开
// 2. 黑幕：||剧透内容||，点击或悬停才显示
//
// 自定义节点通过 data.hName / hProperties 指定转成 HTML 时的标签与属性（mdast-util-to-hast 的约定）。
import type { Blockquote, Paragraph, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast';

interface HastData {
  hName: string;
  hProperties?: Record<string, unknown>;
}

/** mdast 里没有的「容器」节点：只靠 data.hName 决定最终标签 */
interface CustomParent {
  type: string;
  data: HastData;
  children: unknown[];
}

// ============================== 提示框 ==============================

const CALLOUT_LABELS = {
  note: '备注',
  tip: '提示',
  important: '重要',
  warning: '注意',
  caution: '警告',
} as const;

type CalloutType = keyof typeof CALLOUT_LABELS;

/** 兼容 Obsidian 等编辑器里常见的别名 */
const CALLOUT_ALIASES: Record<string, CalloutType> = {
  info: 'note',
  abstract: 'note',
  summary: 'note',
  quote: 'note',
  hint: 'tip',
  success: 'tip',
  check: 'tip',
  question: 'important',
  attention: 'warning',
  danger: 'caution',
  error: 'caution',
  bug: 'caution',
};

const CALLOUT_MARKER = /^\[!([A-Za-z]+)\]([+-]?)[ \t]*([^\n]*)(?:\n|$)/;

function resolveCalloutType(raw: string): CalloutType | null {
  const key = raw.toLowerCase();
  if (key in CALLOUT_LABELS) return key as CalloutType;
  return CALLOUT_ALIASES[key] ?? null;
}

function toCallout(node: Blockquote): void {
  const first = node.children[0];
  if (first?.type !== 'paragraph') return;
  const head = first.children[0];
  if (head?.type !== 'text') return;

  const match = CALLOUT_MARKER.exec(head.value);
  if (!match) return;
  const type = resolveCalloutType(match[1]);
  if (!type) return;

  const fold = match[2];
  const title = match[3].trim() || CALLOUT_LABELS[type];

  // 去掉标记那一行；第一段只剩标记时整段删掉
  head.value = head.value.slice(match[0].length);
  if (head.value === '') first.children.shift();
  if (first.children[0]?.type === 'break') first.children.shift();
  const body = first.children.length > 0 ? node.children : node.children.slice(1);

  const collapsible = fold !== '';
  const titleNode: CustomParent = {
    type: 'calloutTitle',
    data: { hName: collapsible ? 'summary' : 'p', hProperties: { className: ['callout-title'] } },
    children: [{ type: 'text', value: title } satisfies Text],
  };
  const bodyNode: CustomParent = {
    type: 'calloutBody',
    data: { hName: 'div', hProperties: { className: ['callout-body'] } },
    children: body,
  };

  const container = node as unknown as CustomParent;
  container.type = 'callout';
  container.data = {
    hName: collapsible ? 'details' : 'div',
    hProperties: {
      className: ['callout', `callout-${type}`],
      dataCallout: type,
      ...(fold === '+' ? { open: true } : {}),
    },
  };
  container.children = body.length > 0 ? [titleNode, bodyNode] : [titleNode];
}

// ============================== 黑幕 ==============================

const SPOILER_MARK = '||';

type Token = PhrasingContent | typeof SPOILER_MARK;

/** 把一串行内节点里的 ||…|| 包成黑幕；没配对的 || 原样保留 */
function wrapSpoilers(children: PhrasingContent[]): PhrasingContent[] {
  if (!children.some((c) => c.type === 'text' && c.value.includes(SPOILER_MARK))) return children;

  const tokens: Token[] = [];
  for (const child of children) {
    if (child.type !== 'text' || !child.value.includes(SPOILER_MARK)) {
      tokens.push(child);
      continue;
    }
    child.value.split(SPOILER_MARK).forEach((part, i) => {
      if (i > 0) tokens.push(SPOILER_MARK);
      if (part) tokens.push({ type: 'text', value: part });
    });
  }

  const out: PhrasingContent[] = [];
  let open: number | null = null;
  for (const token of tokens) {
    if (token !== SPOILER_MARK) {
      out.push(token);
      continue;
    }
    if (open === null) {
      open = out.length;
      continue;
    }
    const inner = out.splice(open);
    open = null;
    if (inner.length === 0) {
      // 「||||」不当作黑幕
      out.push({ type: 'text', value: SPOILER_MARK + SPOILER_MARK });
      continue;
    }
    const spoiler: CustomParent = {
      type: 'spoiler',
      data: {
        hName: 'span',
        hProperties: { className: ['spoiler'], tabIndex: 0, role: 'button', ariaPressed: 'false', title: '黑幕：点击显示' },
      },
      children: inner,
    };
    out.push(spoiler as unknown as PhrasingContent);
  }
  if (open !== null) out.splice(open, 0, { type: 'text', value: SPOILER_MARK });

  // 合并相邻文本，保持树干净
  return out.reduce<PhrasingContent[]>((acc, node) => {
    const prev = acc[acc.length - 1];
    if (prev?.type === 'text' && node.type === 'text') prev.value += node.value;
    else acc.push(node);
    return acc;
  }, []);
}

// ============================== 遍历 ==============================

const SKIP_TYPES = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html']);

function walk(node: Root | RootContent): void {
  if (SKIP_TYPES.has(node.type) || !('children' in node)) return;
  const parent = node as Parent;

  if (node.type === 'blockquote') toCallout(node);

  // 只有放行内内容的节点才处理黑幕（段落、标题、表格单元格、加粗、链接……）
  const phrasingParent = ['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete', 'link'].includes(node.type);
  if (phrasingParent) {
    (parent as Paragraph).children = wrapSpoilers((parent as Paragraph).children);
  }

  for (const child of parent.children) walk(child as RootContent);
}

/** remark 插件：提示框 + 黑幕 */
export function remarkArticleSyntax() {
  return (tree: Root) => {
    walk(tree);
  };
}
