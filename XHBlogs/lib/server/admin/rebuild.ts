// lib/server/admin/rebuild.ts —— 自己的服务器上：后台保存后自动重新构建网站（仅服务端）
//
// 网站的页面大多是构建时生成的静态页，改了文章 / 数据要重新构建才会上线。Vercel 上是推送提交后自动重新部署；
// 自己的服务器（docs/DEPLOY-BAOTA.md）上由这里接手：本地存储每次保存成功后调用 requestRebuild()，
// 最后一次保存 10 秒后（REBUILD_DEBOUNCE_MS）在后台启动 scripts/self-host/rebuild.mjs —— 构建到 .next-staging，
// 成功后换掉 .next 并重启网站（pm2 reload），失败时线上的旧版本不受影响。
//
// 只在 ADMIN_STORAGE=local 且 SELF_HOST_REBUILD=1 时生效（storageInfo().rebuild），并且只在 next start（生产模式）下。
//
// 状态都在文件里（默认项目根目录，REBUILD_STATUS_FILE 可以换位置，锁、日志放在它旁边）：
// - .rebuild-status.json：{ state, requestedAt, startedAt, finishedAt, reason, log }，构建脚本写，这里读来给后台显示
// - .rebuild.lock：正在构建（只允许一个）；超过 30 分钟或进程已经不在了算作失效
// - .rebuild.pending：构建期间又有新的保存，脚本做完这一次会接着再构建一次
// - .rebuild.log：构建日志
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { DeployStatus } from './storage';

export type RebuildState = 'idle' | 'queued' | 'building' | 'ready' | 'failed';

export interface RebuildStatus {
  state: RebuildState;
  /** ISO 时间；没有时为 null */
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** 触发这次重建的保存（提交说明），或「手动重建」 */
  reason: string;
  /** 失败时日志的最后几十行 */
  log: string;
}

export interface RebuildInfo {
  enabled: boolean;
  status: RebuildStatus;
  /** 还有没包含进当前这次构建的修改：做完这次会再构建一次 */
  pending: boolean;
}

const DEFAULT_DEBOUNCE_MS = 10_000;
/** 和 rebuild.mjs 一致：锁超过这么久算失效 */
const LOCK_STALE_MS = 30 * 60_000;
/** 计时器丢了（等待期间服务器重启）多久之后补发一次 */
const RECOVER_AFTER_MS = 30_000;

const truthy = (value: string | undefined): boolean => /^(1|true|yes|on)$/i.test((value ?? '').trim());

/** 环境变量开了自动重建（是否本地存储由调用方判断，见 storageInfo().rebuild） */
export function rebuildConfigured(): boolean {
  return truthy(process.env.SELF_HOST_REBUILD) && process.env.NODE_ENV === 'production';
}

function debounceMs(): number {
  const raw = (process.env.REBUILD_DEBOUNCE_MS ?? '').trim();
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && n >= 0 ? n : DEFAULT_DEBOUNCE_MS;
}

// turbopackIgnore：运行时才知道的目录，别让打包工具去追踪
const projectDir = (): string => process.cwd();
const statusFile = (): string =>
  path.resolve(/* turbopackIgnore: true */ projectDir(), (process.env.REBUILD_STATUS_FILE ?? '').trim() || '.rebuild-status.json');
const sideFile = (name: string): string => path.join(/* turbopackIgnore: true */ path.dirname(statusFile()), name);

const EMPTY: RebuildStatus = { state: 'idle', requestedAt: null, startedAt: null, finishedAt: null, reason: '', log: '' };

export function readRebuildStatus(): RebuildStatus {
  try {
    const raw = JSON.parse(fs.readFileSync(statusFile(), 'utf8')) as Partial<RebuildStatus>;
    const state = (['idle', 'queued', 'building', 'ready', 'failed'] as const).find((s) => s === raw.state) ?? 'idle';
    const time = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
    return {
      state,
      requestedAt: time(raw.requestedAt),
      startedAt: time(raw.startedAt),
      finishedAt: time(raw.finishedAt),
      reason: typeof raw.reason === 'string' ? raw.reason : '',
      log: typeof raw.log === 'string' ? raw.log : '',
    };
  } catch {
    return { ...EMPTY };
  }
}

/** 先写临时文件再改名，读的一方不会读到写了一半的 JSON */
function writeStatus(status: RebuildStatus): void {
  const file = statusFile();
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  } catch (error) {
    console.error('[rebuild] 写状态文件失败', error);
  }
}

/** 有没有构建正在进行（锁文件在、没超时、进程还活着） */
function lockHeld(): boolean {
  try {
    const lock = JSON.parse(fs.readFileSync(sideFile('.rebuild.lock'), 'utf8')) as { pid?: unknown; at?: unknown };
    if (typeof lock.at === 'number' && Date.now() - lock.at > LOCK_STALE_MS) return false;
    if (typeof lock.pid === 'number' && lock.pid > 0) {
      try {
        process.kill(lock.pid, 0);
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'EPERM';
      }
    }
    return true;
  } catch (error) {
    // 锁文件刚创建、内容还没写完时 JSON 解析会失败：当作有人拿着
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

// 等待中的计时器挂在 globalThis 上：不同的接口路由可能各自打包了一份这个模块，计时器只能有一个
interface Runtime {
  timer: ReturnType<typeof setTimeout> | null;
  requestedAt: number;
  reason: string;
  lastSpawn: number;
}
const RUNTIME_KEY = Symbol.for('xhblogs.admin.rebuild');
const runtime: Runtime = ((globalThis as unknown as Record<symbol, Runtime | undefined>)[RUNTIME_KEY] ??= {
  timer: null,
  requestedAt: 0,
  reason: '',
  lastSpawn: 0,
});

function spawnWorker(requestedAt: number, reason: string): void {
  runtime.lastSpawn = Date.now();
  const script = path.join(/* turbopackIgnore: true */ projectDir(), 'scripts', 'self-host', 'rebuild.mjs');
  try {
    // detached + unref：构建在独立的进程里跑，不占着网站进程；rebuild.mjs 自己还会再脱离一层，网站重启时不会被一起杀掉
    const child = spawn(process.execPath, [script, '--requested-at', String(requestedAt), '--reason', reason], {
      cwd: projectDir(),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      // 环境变量原样传过去（REBUILD_STATUS_FILE 等）；rebuild.mjs 自己负责给 next build / 重启命令清理
      env: process.env,
    });
    child.on('error', (error) => markSpawnFailed(error));
    child.unref();
  } catch (error) {
    markSpawnFailed(error);
  }
}

function markSpawnFailed(error: unknown): void {
  console.error('[rebuild] 启动构建脚本失败', error);
  writeStatus({
    ...readRebuildStatus(),
    state: 'failed',
    finishedAt: new Date().toISOString(),
    log: `启动 scripts/self-host/rebuild.mjs 失败：${error instanceof Error ? error.message : String(error)}`,
  });
}

/**
 * 要求重新构建网站。保存成功后调用（LocalStorage.commit），手动「立即重建」时 immediate=true。
 * 只能在本地存储下调用（接口路由先看 storageInfo().rebuild）；没开 SELF_HOST_REBUILD 时什么也不做。不会抛错。
 */
export function requestRebuild(reason: string, { immediate = false }: { immediate?: boolean } = {}): void {
  if (!rebuildConfigured()) return;
  try {
    const now = Date.now();
    runtime.requestedAt = now;
    runtime.reason = reason;
    if (lockHeld()) {
      // 正在构建：留个记号，那次做完会接着再构建一次（就算这边的计时器因为网站重启丢了也不会漏）。
      // 已有的记号里可能带着 install（代码更新要先装依赖），合并进去，不要冲掉
      let previous: Record<string, unknown> = {};
      try {
        previous = JSON.parse(fs.readFileSync(sideFile('.rebuild.pending'), 'utf8')) as Record<string, unknown>;
      } catch {
        /* 没有记号 */
      }
      fs.writeFileSync(sideFile('.rebuild.pending'), `${JSON.stringify({ ...previous, at: now, reason })}\n`, 'utf8');
    } else {
      writeStatus({ ...readRebuildStatus(), state: 'queued', requestedAt: new Date(now).toISOString(), reason, log: '' });
    }
    if (runtime.timer) clearTimeout(runtime.timer);
    runtime.timer = null;
    if (immediate) {
      spawnWorker(now, reason);
      return;
    }
    runtime.timer = setTimeout(() => {
      runtime.timer = null;
      spawnWorker(runtime.requestedAt, runtime.reason);
    }, debounceMs());
    runtime.timer.unref?.();
  } catch (error) {
    console.error('[rebuild] 安排重建失败', error);
  }
}

/** 给后台看的状态；enabled 由调用方传入（storageInfo().rebuild） */
export function getRebuildInfo(enabled: boolean): RebuildInfo {
  if (!enabled) return { enabled: false, status: { ...EMPTY }, pending: false };
  const status = readRebuildStatus();
  const locked = lockHeld();
  const waiting = runtime.timer !== null;
  const pendingMark = readPendingMark();

  if (status.state === 'building' && !locked) {
    // 状态停在「重建中」但锁已经没人拿着：构建进程中途没了（服务器重启、内存不够被系统杀掉……）
    status.state = 'failed';
    status.log = status.log || '重建进程意外中断了（服务器重启，或者内存不够被系统结束？）。线上还是之前的版本，可以点「立即重建」再试一次。';
  }
  if (waiting && status.state !== 'building') status.state = 'queued';

  // 没人会接手的请求（等待期间网站重启、计时器跟着没了；或者构建进程中途没了，留下了记号）：补发一次
  const now = Date.now();
  if (!waiting && !locked && now - runtime.lastSpawn > 60_000) {
    const requested = status.requestedAt ? Date.parse(status.requestedAt) : 0;
    if (status.state === 'queued' && requested && now - requested > debounceMs() + RECOVER_AFTER_MS) {
      spawnWorker(requested, status.reason || '补上没完成的重建');
    } else if (pendingMark && now - pendingMark.at > RECOVER_AFTER_MS) {
      spawnWorker(pendingMark.at, pendingMark.reason || '补上没完成的重建');
    }
  }
  const pending = status.state !== 'queued' && (waiting || pendingMark !== null);
  return { enabled: true, status, pending };
}

function readPendingMark(): { at: number; reason: string } | null {
  try {
    const mark = JSON.parse(fs.readFileSync(sideFile('.rebuild.pending'), 'utf8')) as { at?: unknown; reason?: unknown };
    return { at: typeof mark.at === 'number' ? mark.at : 0, reason: typeof mark.reason === 'string' ? mark.reason : '' };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : { at: Date.now(), reason: '' };
  }
}

const LABEL: Record<RebuildState, string> = { idle: '还没有重建过', queued: '排队中', building: '重建中', ready: '已上线', failed: '失败' };

/** 换成后台「部署状态」的格式（和 Vercel 的同一个形状，另外带上 rebuild 详情） */
export function rebuildDeployStatus(enabled: boolean): DeployStatus {
  const info = getRebuildInfo(enabled);
  const { state } = info.status;
  return {
    state: state === 'ready' ? 'success' : state === 'failed' ? 'failure' : state === 'idle' ? 'unknown' : 'pending',
    url: null,
    description: LABEL[state],
    rebuild: info,
  };
}
