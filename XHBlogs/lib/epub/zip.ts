// lib/epub/zip.ts —— 极简 ZIP 读取（浏览器端，无依赖）
//
// EPUB 本质是 ZIP。这里只实现读取所需的部分：从文件末尾找到中央目录，列出条目，
// 按需解压单个文件（存储 / Deflate 两种方式，Deflate 用浏览器自带的 DecompressionStream）。
// 不支持 ZIP64 与加密条目（EPUB 基本用不到）；遇到时抛出可读的错误。

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  encrypted: boolean;
}

export class ZipError extends Error {}

export function supportsZip(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

const utf8 = new TextDecoder('utf-8');

export class ZipArchive {
  private constructor(private readonly blob: Blob, private readonly entries: Map<string, ZipEntry>) {}

  static async open(blob: Blob): Promise<ZipArchive> {
    if (!supportsZip()) throw new ZipError('当前浏览器不支持解压，请换用较新版本的 Chrome / Edge / Safari / Firefox');
    // EOCD 位于文件末尾，最多再带 65535 字节注释
    const tailSize = Math.min(blob.size, 65_557);
    const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer());
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === SIG_EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError('文件不是有效的 EPUB（找不到 ZIP 目录）');

    const count = tail.getUint16(eocd + 10, true);
    const cdSize = tail.getUint32(eocd + 12, true);
    const cdOffset = tail.getUint32(eocd + 16, true);
    if (cdOffset === 0xffffffff || count === 0xffff) throw new ZipError('暂不支持超大（ZIP64）EPUB 文件');

    const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
    const entries = new Map<string, ZipEntry>();
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
      if (cd.getUint32(p, true) !== SIG_CENTRAL) throw new ZipError('EPUB 文件已损坏（目录条目异常）');
      const flags = cd.getUint16(p + 8, true);
      const method = cd.getUint16(p + 10, true);
      const compressedSize = cd.getUint32(p + 20, true);
      const uncompressedSize = cd.getUint32(p + 24, true);
      const nameLen = cd.getUint16(p + 28, true);
      const extraLen = cd.getUint16(p + 30, true);
      const commentLen = cd.getUint16(p + 32, true);
      const localHeaderOffset = cd.getUint32(p + 42, true);
      const name = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
      if (!name.endsWith('/')) {
        entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset, encrypted: (flags & 1) === 1 });
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return new ZipArchive(blob, entries);
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  async bytes(path: string): Promise<Uint8Array> {
    const entry = this.entries.get(path);
    if (!entry) throw new ZipError(`EPUB 里缺少文件：${path}`);
    if (entry.encrypted) throw new ZipError('这本 EPUB 是加密的（带 DRM），无法在浏览器里打开');

    const header = new DataView(await this.blob.slice(entry.localHeaderOffset, entry.localHeaderOffset + 30).arrayBuffer());
    if (header.getUint32(0, true) !== SIG_LOCAL) throw new ZipError('EPUB 文件已损坏（文件头异常）');
    const start = entry.localHeaderOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    const raw = this.blob.slice(start, start + entry.compressedSize);

    if (entry.method === 0) return new Uint8Array(await raw.arrayBuffer());
    if (entry.method === 8) {
      const stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new ZipError(`不支持的压缩方式（${entry.method}）`);
  }

  async text(path: string): Promise<string> {
    return utf8.decode(await this.bytes(path));
  }
}
