"use client";
// lib/admin/client.ts —— 网页后台（浏览器端）：调用 /api/admin/* 接口、上传文件
//
// 上传的文件不会马上提交：先「暂存」拿到一个 id，点保存时随这次提交一起写进仓库（见 lib/server/admin/storage.ts）。
// - 图片：在浏览器里压成 WebP（长边不超过 2400px），一般几百 KB，走 /api/admin/stage
// - 音频：3MB 以内同样走 /api/admin/stage；更大的：GitHub 存储时直接从浏览器传到 GitHub（Vercel 的接口收不了 4.5MB 以上的请求），
//   本地存储（自己的服务器）时把原始文件直接传给服务器，不经过 GitHub

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: { 'X-Admin': '1', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON（比如网关报错页） */
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `请求失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** 一个暂存的附件：保存时一起提交到 path */
export interface StagedFile {
  /** 仓库里的路径（相对博客根目录），如 public/images/uploads/2026/10/a.webp */
  path: string;
  staged: string;
  /** 网站上的地址，如 /images/uploads/2026/10/a.webp */
  url: string;
  /** 浏览器里的预览地址（还没部署时网站上看不到这张图） */
  preview: string;
}

const STAGE_LIMIT = 2.9 * 1024 * 1024;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(blob);
  });
}

/** 暂存一个文件，返回 id */
export async function stage(blob: Blob): Promise<string> {
  if (blob.size > STAGE_LIMIT) {
    const { direct } = await api<{ direct: { repo: string; token: string } | null }>('/api/admin/stage');
    if (direct) {
      const res = await fetch(`https://api.github.com/repos/${direct.repo}/git/blobs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${direct.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: await toBase64(blob), encoding: 'base64' }),
      });
      if (!res.ok) throw new ApiError(`上传到 GitHub 失败（${res.status}）`, res.status);
      return ((await res.json()) as { sha: string }).sha;
    }
    return stageRaw(blob);
  }
  const { id } = await api<{ id: string }>('/api/admin/stage', { method: 'POST', body: { data: await toBase64(blob) } });
  return id;
}

/** 本地存储（自己的服务器）：大文件按原始字节上传，比 base64 小三分之一，服务器也不用解一个巨大的 JSON */
async function stageRaw(blob: Blob): Promise<string> {
  const res = await fetch('/api/admin/stage', {
    method: 'POST',
    headers: { 'X-Admin': '1', 'Content-Type': 'application/octet-stream' },
    body: blob,
    cache: 'no-store',
  });
  let data: { id?: string; error?: string } | null = null;
  try {
    data = (await res.json()) as { id?: string; error?: string };
  } catch {
    /* 非 JSON（比如 nginx 的报错页） */
  }
  if (!res.ok || !data?.id) {
    const message =
      data?.error ?? (res.status === 413 ? '文件太大，被服务器拒收了（nginx 的 client_max_body_size，见 docs/DEPLOY-BAOTA.md）' : `上传失败（${res.status}）`);
    throw new ApiError(message, res.status);
  }
  return data.id;
}

const MAX_SIDE = 2400;

/** 图片压成 WebP；GIF、SVG 保持原样（压了会丢动画 / 矢量） */
export async function compressImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const type = file.type.toLowerCase();
  if (type === 'image/gif' || type === 'image/svg+xml') return { blob: file, ext: type === 'image/gif' ? '.gif' : '.svg' };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.86, 0.78, 0.68, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && (blob.size <= STAGE_LIMIT || quality === 0.55)) return { blob, ext: '.webp' };
  }
  throw new Error('图片压缩失败');
}

/** 文件名里只留字母数字、中文和 - _ */
export function safeName(name: string, fallback = 'file'): string {
  const base = name.replace(/\.[^.]+$/, '');
  const cleaned = base
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}

const randomTag = (): string => Math.random().toString(36).slice(2, 8);

/** 上传一张图片：压缩、暂存，返回之后要随保存提交的附件 */
export async function uploadImage(file: File): Promise<StagedFile> {
  const { blob, ext } = await compressImage(file);
  const staged = await stage(blob);
  const now = new Date();
  const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  const name = `${safeName(file.name, 'image')}-${randomTag()}${ext}`;
  return {
    path: `public/images/uploads/${dir}/${name}`,
    staged,
    url: `/images/uploads/${dir}/${name}`,
    preview: URL.createObjectURL(blob),
  };
}

/** 只提交还在用的附件（上传了又删掉的图不提交） */
export function usedAttachments(files: StagedFile[], ...texts: unknown[]): { path: string; staged: string }[] {
  const haystack = JSON.stringify(texts);
  return files.filter((f) => haystack.includes(f.url)).map(({ path, staged }) => ({ path, staged }));
}

/** 预览时把还没部署的图片换成浏览器里的预览地址 */
export function previewUrl(url: string, files: StagedFile[]): string {
  return files.find((f) => f.url === url)?.preview ?? url;
}

export interface SaveResult {
  ok: true;
  sha: string | null;
}

/** 当前时间，格式 YYYY-MM-DD HH:mm:ss（按浏览器所在时区） */
export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
