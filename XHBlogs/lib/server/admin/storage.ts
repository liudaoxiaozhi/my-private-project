// lib/server/admin/storage.ts —— 后台读写博客文件的地方（仅服务端）
//
// 两种实现，接口一样：
// - GitHub（线上用）：读文件走 GitHub API，保存时把这次改动的所有文件做成「一个提交」推到仓库，
//   Vercel 收到提交后自动重新部署，一两分钟后网站生效。需要环境变量 GITHUB_TOKEN（见 docs/ADMIN.md）
// - 本地（开发 / 测试用）：直接读写磁盘上的文件（ADMIN_LOCAL_ROOT，默认是项目目录）
//
// 选哪种：ADMIN_STORAGE=local 时一定用本地；否则配置了 GITHUB_TOKEN 用 GitHub；都没有时开发模式用本地，线上报错提示去配置。
//
// 路径一律相对博客根目录（XHBlogs/），并且只能落在 ALLOWED 列出的位置，后台写不到代码文件。
//
// 大文件（图片、音乐）先「暂存」：上传时只建一个 blob（GitHub）或临时文件（本地），拿到一个 id，
// 点保存时随这次提交一起落到目标路径。这样一篇带五张图的文章也只产生一个提交、一次部署。
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { outboundFetch } from '../outboundFetch';

export interface FileEntry {
  name: string;
  /** 相对博客根目录 */
  path: string;
  type: 'file' | 'dir';
  size: number;
}

export type Change =
  | { path: string; content: string }
  | { path: string; staged: string }
  | { path: string; from: string }
  | { path: string; delete: true };

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  url: string;
}

export interface DeployStatus {
  /** success：已上线；pending：部署中；failure / error：失败；unknown：没有部署信息 */
  state: 'success' | 'pending' | 'failure' | 'error' | 'unknown';
  url: string | null;
  description: string;
}

export interface Storage {
  kind: 'github' | 'local';
  readText(file: string): Promise<string | null>;
  list(dir: string): Promise<FileEntry[]>;
  /** 暂存一个文件，返回 id，之后在 commit 里用 { path, staged: id } 落到目标位置 */
  stage(data: Buffer): Promise<string>;
  commit(changes: Change[], message: string): Promise<{ sha: string | null }>;
  recentCommits(limit: number): Promise<CommitInfo[]>;
  deployStatus(sha: string): Promise<DeployStatus>;
}

export class StorageError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

// —— 路径白名单 ——

const ALLOWED: RegExp[] = [
  /^posts\/[^/]+\.md$/,
  /^chatters\/[^/]+\.md$/,
  /^moments\/[^/]+\.md$/,
  /^app\/about\/about\.md$/,
  /^data\/(albums|friends|projects|netease|anime|secrets)\.json$/,
  /^public\/anime\/covers\/[^/]+$/,
  /^siteConfig\.overrides\.json$/,
  /^public\/images\/uploads\/[^/]+(\/[^/]+)*$/,
  /^public\/music\/[^/]+$/,
];
const ALLOWED_DIRS = ['posts', 'chatters', 'moments', 'data', 'public/music', 'public/images/uploads'];

export function assertWritable(file: string): string {
  const normalized = path.posix.normalize(file);
  if (normalized !== file || file.startsWith('/') || file.split('/').some((part) => part === '..' || part === '' || part.startsWith('.'))) {
    throw new StorageError(`路径不合法：${file}`, 400);
  }
  if (!ALLOWED.some((re) => re.test(file))) throw new StorageError(`后台不能修改这个位置：${file}`, 403);
  return file;
}

function assertListable(dir: string): string {
  if (!ALLOWED_DIRS.some((d) => dir === d || dir.startsWith(`${d}/`)) || dir.includes('..')) throw new StorageError(`不能列出：${dir}`, 403);
  return dir;
}

// —— 本地 ——

class LocalStorage implements Storage {
  kind = 'local' as const;
  private stagingDir = path.join(os.tmpdir(), 'xhblogs-admin-staging');

  constructor(private root: string) {}

  private abs(file: string): string {
    return path.join(/* turbopackIgnore: true */ this.root, ...file.split('/'));
  }

  async readText(file: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(this.abs(file), 'utf8');
    } catch {
      return null;
    }
  }

  async list(dir: string): Promise<FileEntry[]> {
    assertListable(dir);
    try {
      const entries = await fs.promises.readdir(this.abs(dir), { withFileTypes: true });
      return Promise.all(
        entries.map(async (e) => ({
          name: e.name,
          path: `${dir}/${e.name}`,
          type: e.isDirectory() ? ('dir' as const) : ('file' as const),
          size: e.isDirectory() ? 0 : (await fs.promises.stat(this.abs(`${dir}/${e.name}`))).size,
        })),
      );
    } catch {
      return [];
    }
  }

  async stage(data: Buffer): Promise<string> {
    await fs.promises.mkdir(this.stagingDir, { recursive: true });
    const id = `local-${crypto.randomUUID()}`;
    await fs.promises.writeFile(path.join(this.stagingDir, id), data);
    return id;
  }

  async commit(changes: Change[]): Promise<{ sha: string | null }> {
    // 改名分两步：先全部挪到临时名，再挪到目标，这样 A→B、B→A 这种互换也不会互相覆盖
    const moving = new Map<string, string>();
    for (const change of changes) {
      if (!('from' in change)) continue;
      const temp = `${this.abs(assertWritable(change.from))}.moving-${crypto.randomUUID()}`;
      await fs.promises.rename(this.abs(change.from), temp);
      moving.set(change.from, temp);
    }
    for (const change of changes) {
      const target = this.abs(assertWritable(change.path));
      if ('delete' in change) {
        await fs.promises.rm(target, { force: true });
        continue;
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if ('content' in change) await fs.promises.writeFile(target, change.content, 'utf8');
      else if ('staged' in change) {
        if (!/^local-[0-9a-f-]+$/.test(change.staged)) throw new StorageError('暂存文件不存在，请重新上传', 400);
        await fs.promises.copyFile(path.join(this.stagingDir, change.staged), target);
      } else await fs.promises.rename(moving.get(change.from)!, target);
    }
    return { sha: null };
  }

  async recentCommits(): Promise<CommitInfo[]> {
    return [];
  }

  async deployStatus(): Promise<DeployStatus> {
    return { state: 'unknown', url: null, description: '本地模式：文件已直接写入磁盘' };
  }
}

// —— GitHub ——

interface GitHubConfig {
  token: string;
  repo: string;
  branch: string;
  /** 博客在仓库里的子目录（如 XHBlogs）；博客就在仓库根目录时为空 */
  dir: string;
}

class GitHubStorage implements Storage {
  kind = 'github' as const;

  constructor(private cfg: GitHubConfig) {}

  private full(file: string): string {
    return this.cfg.dir ? `${this.cfg.dir}/${file}` : file;
  }

  private async api<T>(endpoint: string, init: { method?: string; body?: unknown; accept?: string } = {}): Promise<T> {
    const res = await outboundFetch(`https://api.github.com/repos/${this.cfg.repo}${endpoint}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        Accept: init.accept ?? 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'xhblogs-admin',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 404) throw new StorageError('not found', 404);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const hint =
        res.status === 401 ? 'GITHUB_TOKEN 无效或已过期' : res.status === 403 ? 'GITHUB_TOKEN 没有这个仓库的写入权限（Contents: Read and write）' : '';
      throw new StorageError(`GitHub 接口出错（${res.status}）${hint ? `：${hint}` : ''}${text ? ` ${text.slice(0, 200)}` : ''}`, 502);
    }
    if (init.accept?.includes('raw')) return (await res.text()) as T;
    return (await res.json()) as T;
  }

  private ref = (): string => `heads/${this.cfg.branch}`;

  async readText(file: string): Promise<string | null> {
    try {
      const query = `?ref=${encodeURIComponent(this.cfg.branch)}`;
      return await this.api<string>(`/contents/${encodePath(this.full(file))}${query}`, { accept: 'application/vnd.github.raw+json' });
    } catch (error) {
      if (error instanceof StorageError && error.status === 404) return null;
      throw error;
    }
  }

  async list(dir: string): Promise<FileEntry[]> {
    assertListable(dir);
    try {
      const items = await this.api<{ name: string; type: string; size: number }[]>(
        `/contents/${encodePath(this.full(dir))}?ref=${encodeURIComponent(this.cfg.branch)}`,
      );
      if (!Array.isArray(items)) return [];
      return items.map((item) => ({ name: item.name, path: `${dir}/${item.name}`, type: item.type === 'dir' ? 'dir' : 'file', size: item.size }));
    } catch (error) {
      if (error instanceof StorageError && error.status === 404) return [];
      throw error;
    }
  }

  async stage(data: Buffer): Promise<string> {
    const blob = await this.api<{ sha: string }>('/git/blobs', { method: 'POST', body: { content: data.toString('base64'), encoding: 'base64' } });
    return blob.sha;
  }

  private async blobShaOf(file: string, treeSha: string): Promise<string> {
    // 按目录逐级找：比整棵树递归列出省流量
    const parts = this.full(file).split('/');
    let sha = treeSha;
    for (let i = 0; i < parts.length; i++) {
      const tree = await this.api<{ tree: { path: string; sha: string; type: string }[] }>(`/git/trees/${sha}`);
      const entry = tree.tree.find((e) => e.path === parts[i]);
      if (!entry) throw new StorageError(`找不到文件：${file}`, 404);
      sha = entry.sha;
    }
    return sha;
  }

  async commit(changes: Change[], message: string): Promise<{ sha: string | null }> {
    if (changes.length === 0) return { sha: null };
    for (const change of changes) assertWritable(change.path);
    // 有人（比如另一台设备）同时提交了，就基于最新的再做一次
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = await this.api<{ object: { sha: string } }>(`/git/ref/${this.ref()}`);
      const parent = await this.api<{ tree: { sha: string } }>(`/git/commits/${head.object.sha}`);
      const entries: { path: string; mode: '100644'; type: 'blob'; sha: string | null }[] = [];
      for (const change of changes) {
        const target = this.full(change.path);
        if ('delete' in change) entries.push({ path: target, mode: '100644', type: 'blob', sha: null });
        else if ('content' in change) {
          const blob = await this.api<{ sha: string }>('/git/blobs', {
            method: 'POST',
            body: { content: Buffer.from(change.content, 'utf8').toString('base64'), encoding: 'base64' },
          });
          entries.push({ path: target, mode: '100644', type: 'blob', sha: blob.sha });
        } else if ('staged' in change) {
          if (!/^[0-9a-f]{40}$/.test(change.staged)) throw new StorageError('暂存文件不存在，请重新上传', 400);
          entries.push({ path: target, mode: '100644', type: 'blob', sha: change.staged });
        } else {
          const sha = await this.blobShaOf(assertWritable(change.from), parent.tree.sha);
          entries.push({ path: target, mode: '100644', type: 'blob', sha });
          entries.push({ path: this.full(change.from), mode: '100644', type: 'blob', sha: null });
        }
      }
      // 同一个路径既被删除（改名的旧名）又被写入（别的文件改成了这个名字）时，以写入为准
      const written = new Set(entries.filter((e) => e.sha !== null).map((e) => e.path));
      const finalEntries = entries.filter((e) => e.sha !== null || !written.has(e.path));
      const tree = await this.api<{ sha: string }>('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree: finalEntries } });
      const commit = await this.api<{ sha: string }>('/git/commits', {
        method: 'POST',
        body: { message, tree: tree.sha, parents: [head.object.sha] },
      });
      try {
        await this.api(`/git/refs/${this.ref()}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
        return { sha: commit.sha };
      } catch (error) {
        // 422：分支在这期间被别人推进了，重试
        if (!(error instanceof StorageError && error.message.includes('422')) || attempt === 2) throw error;
      }
    }
    throw new StorageError('提交失败，请稍后再试', 502);
  }

  async recentCommits(limit: number): Promise<CommitInfo[]> {
    const pathQuery = this.cfg.dir ? `&path=${encodeURIComponent(this.cfg.dir)}` : '';
    const items = await this.api<{ sha: string; html_url: string; commit: { message: string; committer: { date: string } } }[]>(
      `/commits?sha=${encodeURIComponent(this.cfg.branch)}&per_page=${limit}${pathQuery}`,
    );
    return items.map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0], date: c.commit.committer.date, url: c.html_url }));
  }

  async deployStatus(sha: string): Promise<DeployStatus> {
    // Vercel 会把部署状态回写到提交上（commit status），这里读出来
    const combined = await this.api<{ state: string; statuses: { state: string; context: string; target_url: string | null; description: string | null }[] }>(
      `/commits/${sha}/status`,
    );
    const vercel = combined.statuses.find((s) => /vercel/i.test(s.context)) ?? combined.statuses[0];
    if (!vercel) return { state: 'unknown', url: null, description: '还没有部署信息' };
    const state = (['success', 'pending', 'failure', 'error'] as const).find((s) => s === vercel.state) ?? 'unknown';
    return { state, url: vercel.target_url, description: vercel.description ?? '' };
  }
}

const encodePath = (file: string): string => file.split('/').map(encodeURIComponent).join('/');

// —— 选择实现 ——

export interface StorageInfo {
  kind: 'github' | 'local' | 'none';
  /** GitHub：owner/repo@branch；本地：目录 */
  target: string;
  /** kind 为 none 时，告诉用户缺什么 */
  problem?: string;
}

export function storageInfo(): StorageInfo {
  if (process.env.ADMIN_STORAGE === 'local') return { kind: 'local', target: localRoot() };
  const token = (process.env.GITHUB_TOKEN ?? '').trim();
  if (token) {
    const repo = (process.env.GITHUB_REPO ?? '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { kind: 'none', target: '', problem: '已配置 GITHUB_TOKEN，但 GITHUB_REPO 没填或格式不对（应为 用户名/仓库名）' };
    return { kind: 'github', target: `${repo}@${githubBranch()}` };
  }
  if (process.env.NODE_ENV !== 'production') return { kind: 'local', target: localRoot() };
  return { kind: 'none', target: '', problem: '还没配置 GITHUB_TOKEN 和 GITHUB_REPO，后台改不了文件（见 docs/ADMIN.md）' };
}

const githubBranch = (): string => (process.env.GITHUB_BRANCH ?? '').trim() || 'main';
// turbopackIgnore：这里是运行时才知道的目录，别让打包工具把整个项目当成依赖打进去
const localRoot = (): string => path.resolve(/* turbopackIgnore: true */ (process.env.ADMIN_LOCAL_ROOT ?? '').trim() || process.cwd());

export function getStorage(): Storage {
  const info = storageInfo();
  if (info.kind === 'github') {
    return new GitHubStorage({
      token: (process.env.GITHUB_TOKEN ?? '').trim(),
      repo: (process.env.GITHUB_REPO ?? '').trim(),
      branch: githubBranch(),
      // 博客在仓库里的子目录；填 . 表示就在仓库根目录
      dir: (process.env.GITHUB_BLOG_DIR || 'XHBlogs').trim().replace(/^\.$/, '').replace(/^\/+|\/+$/g, ''),
    });
  }
  if (info.kind === 'local') return new LocalStorage(localRoot());
  throw new StorageError(info.problem ?? '存储未配置', 503);
}

/** 大文件直传 GitHub 用（浏览器 → GitHub，绕开 Vercel 4.5MB 的请求体上限）；只给已登录的管理员 */
export function githubUploadTarget(): { repo: string; token: string } | null {
  const info = storageInfo();
  if (info.kind !== 'github') return null;
  return { repo: (process.env.GITHUB_REPO ?? '').trim(), token: (process.env.GITHUB_TOKEN ?? '').trim() };
}
