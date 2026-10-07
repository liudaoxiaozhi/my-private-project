// lib/epub/epub.ts —— 在浏览器里解析 EPUB（仅客户端使用，文件不上传、不离开读者的设备）
//
// - 读取书名、作者、封面、阅读顺序（spine）和目录（EPUB3 nav 或 EPUB2 NCX）
// - 按章节取出 XHTML，用白名单重建 DOM：去掉脚本、事件属性、外部样式、表单等，图片换成本地 blob 地址，
//   书内链接改成 data-href 由阅读器接管；即使 EPUB 里藏了恶意代码也不会在页面中执行
// - 用完调用 dispose() 释放图片占用的内存

import { ZipArchive } from './zip';

export interface TocItem {
  title: string;
  depth: number;
  /** 对应的阅读顺序下标；目录指向的文件不在阅读顺序里时为 -1 */
  spineIndex: number;
  /** 章内锚点（不含 #），可能为空 */
  fragment: string;
}

export interface LinkTarget {
  spineIndex: number;
  fragment: string;
}

export interface EpubBook {
  title: string;
  author: string;
  /** 封面的 blob 地址；没有封面时为 null */
  coverUrl: string | null;
  coverBlob: Blob | null;
  /** 阅读顺序中的「节」数 */
  sectionCount: number;
  toc: TocItem[];
  /** 第 i 节所属的目录标题（取它之前最近的一条目录） */
  sectionTitle: (index: number) => string;
  /** 清洗后的第 i 节 HTML */
  sectionHtml: (index: number) => Promise<string>;
  /** 解析阅读器里点击的书内链接（data-href 的值） */
  resolveLink: (dataHref: string) => LinkTarget | null;
  dispose: () => void;
}

export class EpubError extends Error {}

// ============================== 路径工具 ==============================

const dirname = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

/** 以 base 文件所在目录为起点解析相对路径；返回 [路径, 锚点] */
function resolvePath(baseFile: string, href: string): [string, string] {
  const [rawPath, fragment = ''] = href.split('#');
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    /* 保留原样 */
  }
  if (!decoded) return [baseFile, fragment];
  const parts = (decoded.startsWith('/') ? decoded.slice(1) : dirname(baseFile) + decoded).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return [out.join('/'), fragment];
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp',
};
const mimeOf = (path: string): string => MIME_BY_EXT[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

function parseXml(text: string, type: DOMParserSupportedType = 'application/xml'): Document {
  const doc = new DOMParser().parseFromString(text, type);
  // XHTML 写得不规范时退回宽松的 HTML 解析
  if (type !== 'text/html' && doc.getElementsByTagName('parsererror').length > 0) {
    return new DOMParser().parseFromString(text, 'text/html');
  }
  return doc;
}

const byLocalName = (root: Document | Element, name: string): Element[] =>
  Array.from(root.getElementsByTagNameNS('*', name));

const firstText = (root: Document | Element, name: string): string =>
  (byLocalName(root, name)[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();

// ============================== 清洗章节 HTML ==============================

/** 原样保留的元素 */
const KEEP = new Set([
  'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'em', 'i', 'strong', 'b', 'u', 's', 'del', 'ins',
  'sub', 'sup', 'small', 'mark', 'blockquote', 'q', 'cite', 'abbr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'img',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'pre', 'code',
  'ruby', 'rt', 'rp', 'rb', 'time', 'wbr', 'kbd', 'var', 'samp',
]);
/** 换成等价的安全元素 */
const RENAME: Record<string, string> = {
  section: 'div', article: 'div', aside: 'div', header: 'div', footer: 'div', main: 'div', nav: 'div',
  center: 'div', font: 'span', big: 'span', tt: 'code', body: 'div',
};
/** 连同内容一起丢弃 */
const DROP = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select',
  'textarea', 'option', 'link', 'meta', 'base', 'title', 'head', 'audio', 'video', 'source', 'track', 'canvas',
  'noscript', 'template', 'math', 'dialog',
]);

const EXTERNAL = /^(https?:|mailto:)/i;
const LEADING_SPACES = /^[\s　 ]+/;

function hrefOf(el: Element): string {
  return el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
}

// ============================== 打开 EPUB ==============================

export async function openEpub(file: Blob): Promise<EpubBook> {
  const zip = await ZipArchive.open(file);

  // 1) container.xml → OPF
  if (!zip.has('META-INF/container.xml')) throw new EpubError('这不是有效的 EPUB 文件（缺少 container.xml）');
  const container = parseXml(await zip.text('META-INF/container.xml'));
  const opfPath = byLocalName(container, 'rootfile')[0]?.getAttribute('full-path') ?? '';
  if (!opfPath || !zip.has(opfPath)) throw new EpubError('EPUB 里找不到书籍描述文件（OPF）');
  const opf = parseXml(await zip.text(opfPath));

  // 2) 元数据
  const title = firstText(opf, 'title') || '未命名';
  const author = byLocalName(opf, 'creator').map((e) => (e.textContent ?? '').trim()).filter(Boolean).join('、');

  // 3) 清单与阅读顺序
  interface ManifestItem { id: string; path: string; type: string; props: string }
  const manifest = new Map<string, ManifestItem>();
  for (const item of byLocalName(opf, 'item')) {
    const id = item.getAttribute('id') ?? '';
    const href = item.getAttribute('href') ?? '';
    if (!id || !href) continue;
    manifest.set(id, {
      id,
      path: resolvePath(opfPath, href)[0],
      type: item.getAttribute('media-type') ?? '',
      props: item.getAttribute('properties') ?? '',
    });
  }
  const spineEl = byLocalName(opf, 'spine')[0];
  const spine = byLocalName(opf, 'itemref')
    .filter((ref) => ref.getAttribute('linear') !== 'no')
    .map((ref) => manifest.get(ref.getAttribute('idref') ?? '')?.path ?? '')
    .filter((p) => p && zip.has(p));
  if (spine.length === 0) throw new EpubError('这本 EPUB 没有可阅读的正文');
  const spineIndexOf = new Map(spine.map((p, i) => [p, i] as const));

  // 4) 资源（图片）→ blob 地址，按需生成、统一释放
  const urls = new Map<string, string>();
  const resourceUrl = async (path: string): Promise<string | null> => {
    const cached = urls.get(path);
    if (cached) return cached;
    if (!zip.has(path)) return null;
    const bytes = await zip.bytes(path);
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeOf(path) }));
    urls.set(path, url);
    return url;
  };

  // 5) 封面
  const items = [...manifest.values()];
  const coverMetaId = byLocalName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content') ?? '';
  const coverItem =
    items.find((i) => i.props.split(/\s+/).includes('cover-image')) ??
    (coverMetaId ? manifest.get(coverMetaId) : undefined) ??
    items.find((i) => i.type.startsWith('image/') && /cover/i.test(i.id + i.path));
  let coverBlob: Blob | null = null;
  let coverUrl: string | null = null;
  if (coverItem && coverItem.type.startsWith('image/') && zip.has(coverItem.path)) {
    const bytes = await zip.bytes(coverItem.path);
    coverBlob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: coverItem.type || mimeOf(coverItem.path) });
    coverUrl = URL.createObjectURL(coverBlob);
    urls.set(coverItem.path, coverUrl);
  }

  // 6) 目录：优先 EPUB3 nav，其次 EPUB2 NCX
  const toc: TocItem[] = [];
  const pushToc = (label: string, baseFile: string, href: string, depth: number) => {
    const text = label.replace(/\s+/g, ' ').trim();
    if (!text || !href) return;
    const [path, fragment] = resolvePath(baseFile, href);
    toc.push({ title: text, depth, spineIndex: spineIndexOf.get(path) ?? -1, fragment });
  };

  const navItem = items.find((i) => i.props.split(/\s+/).includes('nav'));
  if (navItem && zip.has(navItem.path)) {
    const navDoc = parseXml(await zip.text(navItem.path), 'application/xhtml+xml');
    const navs = byLocalName(navDoc, 'nav');
    const tocNav = navs.find((n) => (n.getAttribute('epub:type') ?? n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? '').includes('toc')) ?? navs[0];
    const walk = (list: Element, depth: number) => {
      for (const li of Array.from(list.children).filter((c) => c.localName === 'li')) {
        const link = Array.from(li.children).find((c) => c.localName === 'a' || c.localName === 'span');
        if (link) pushToc(link.textContent ?? '', navItem.path, link.getAttribute('href') ?? '', depth);
        const sub = Array.from(li.children).find((c) => c.localName === 'ol' || c.localName === 'ul');
        if (sub) walk(sub, depth + 1);
      }
    };
    const rootList = tocNav ? Array.from(tocNav.children).find((c) => c.localName === 'ol' || c.localName === 'ul') : undefined;
    if (rootList) walk(rootList, 0);
  }
  if (toc.length === 0) {
    const ncxId = spineEl?.getAttribute('toc') ?? '';
    const ncxItem = (ncxId ? manifest.get(ncxId) : undefined) ?? items.find((i) => i.type === 'application/x-dtbncx+xml');
    if (ncxItem && zip.has(ncxItem.path)) {
      const ncx = parseXml(await zip.text(ncxItem.path));
      const walk = (parent: Element, depth: number) => {
        for (const point of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
          const label = byLocalName(point, 'text')[0]?.textContent ?? '';
          const src = Array.from(point.children).find((c) => c.localName === 'content')?.getAttribute('src') ?? '';
          pushToc(label, ncxItem.path, src, depth);
          walk(point, depth + 1);
        }
      };
      const navMap = byLocalName(ncx, 'navMap')[0];
      if (navMap) walk(navMap, 0);
    }
  }

  // 7) 每一节的标题：本节对应的第一条目录；没有就沿用上一节的
  const titles: string[] = [];
  let last = title;
  for (let i = 0; i < spine.length; i++) {
    const hit = toc.find((t) => t.spineIndex === i);
    if (hit) last = hit.title;
    titles.push(last);
  }

  // 8) 章节 HTML
  const sectionHtml = async (index: number): Promise<string> => {
    const path = spine[index];
    if (!path) return '';
    const doc = parseXml(await zip.text(path), 'application/xhtml+xml');
    const body = byLocalName(doc, 'body')[0] ?? doc.documentElement;

    // 先把要用到的图片准备好
    const images = new Map<string, string>();
    const imageRefs = [...byLocalName(body, 'img').map((e) => e.getAttribute('src') ?? ''), ...byLocalName(body, 'image').map(hrefOf)].filter(Boolean);
    await Promise.all(imageRefs.map(async (ref) => {
      const [p] = resolvePath(path, ref);
      const url = await resourceUrl(p);
      if (url) images.set(ref, url);
    }));

    const out = document.createElement('div');
    const build = (src: Node, parent: Node) => {
      for (const node of Array.from(src.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          parent.appendChild(document.createTextNode(node.textContent ?? ''));
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        const tag = el.localName.toLowerCase();
        if (DROP.has(tag)) continue;

        // 封面页常见写法：<svg><image xlink:href="cover.jpg"/></svg> → 普通图片
        if (tag === 'svg') {
          const image = byLocalName(el, 'image')[0];
          const url = image ? images.get(hrefOf(image)) : undefined;
          if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            parent.appendChild(img);
          }
          continue;
        }

        const target = KEEP.has(tag) ? tag : RENAME[tag];
        if (!target) {
          build(el, parent); // 不认识的元素：去掉外壳，保留内容
          continue;
        }
        const clean = document.createElement(target);
        const id = el.getAttribute('id');
        if (id) clean.id = `ep-${id}`;
        const lang = el.getAttribute('lang') ?? el.getAttribute('xml:lang');
        if (lang) clean.setAttribute('lang', lang);

        if (target === 'img') {
          const url = images.get(el.getAttribute('src') ?? '');
          if (!url) continue;
          clean.setAttribute('src', url);
          clean.setAttribute('alt', el.getAttribute('alt') ?? '');
          clean.setAttribute('loading', 'lazy');
          // 夹在文字中间的小图（注释标记、生僻字图片等）保持在行内，单独成段的插图照常居中显示
          if ((el.parentElement?.textContent ?? '').trim()) clean.className = 'ep-inline';
        } else if (target === 'a') {
          const href = el.getAttribute('href') ?? '';
          if (EXTERNAL.test(href)) {
            clean.setAttribute('href', href);
            clean.setAttribute('target', '_blank');
            clean.setAttribute('rel', 'noopener noreferrer');
          } else if (href) {
            const [p, frag] = resolvePath(path, href);
            clean.setAttribute('href', '#');
            clean.setAttribute('data-href', `${p}#${frag}`);
          }
        } else if (target === 'td' || target === 'th') {
          for (const attr of ['colspan', 'rowspan']) {
            const v = el.getAttribute(attr);
            if (v && /^\d{1,3}$/.test(v)) clean.setAttribute(attr, v);
          }
        } else if (target === 'ol') {
          const start = el.getAttribute('start');
          if (start && /^\d{1,5}$/.test(start)) clean.setAttribute('start', start);
        }

        build(el, clean);

        // 段首的全角空格交给阅读器的首行缩进，避免缩进两次
        if (target === 'p' && clean.firstChild?.nodeType === Node.TEXT_NODE) {
          clean.firstChild.textContent = (clean.firstChild.textContent ?? '').replace(LEADING_SPACES, '');
        }
        parent.appendChild(clean);
      }
    };
    build(body, out);
    return out.innerHTML;
  };

  const resolveLink = (dataHref: string): LinkTarget | null => {
    const [path, fragment = ''] = dataHref.split('#');
    const spineIndex = spineIndexOf.get(path);
    return spineIndex === undefined ? null : { spineIndex, fragment };
  };

  return {
    title,
    author,
    coverUrl,
    coverBlob,
    sectionCount: spine.length,
    toc: toc.filter((t) => t.spineIndex >= 0),
    sectionTitle: (index) => titles[index] ?? title,
    sectionHtml,
    resolveLink,
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
