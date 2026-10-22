#!/usr/bin/env node
// scripts/self-host/rebuild.mjs —— 在自己的服务器上重新构建并上线网站（部署步骤见 docs/DEPLOY-BAOTA.md）
//
// 谁会运行它：
// - 网站后台：保存后由 lib/server/admin/rebuild.ts 自动启动（需要 ADMIN_STORAGE=local、SELF_HOST_REBUILD=1）
// - scripts/self-host/update.sh：拉到新代码之后
// - 手动：node scripts/self-host/rebuild.mjs                 在后台开始，马上返回（进度看 .rebuild.log）
//         node scripts/self-host/rebuild.mjs --foreground    在当前终端里跑，直接看到输出
//   其他参数：--reason "说明"（显示在后台）、--install（构建前先 npm ci，依赖有变化时用）
//
// 做什么：
// 1. 拿锁 .rebuild.lock，同一时间只有一个构建（锁 30 分钟没更新或进程已经不在了算作失效）。
//    已经有构建在跑时留下 .rebuild.pending，那次做完会接着再构建一次，把这期间的修改也带上
// 2. 状态写进 .rebuild-status.json：building
// 3. npm run build，输出到 .next-staging —— 线上用的 .next 不动，构建失败网站照常运行旧版本
//    （.env.production.local 里的配置由 Next 自己读取）
// 4. 换目录：.next → .next-old，.next-staging → .next（图片优化的缓存搬过去，免得重新压一遍）
// 5. 重启网站：REBUILD_RESTART_CMD（默认 pm2 reload xhblogs --update-env），成功后删掉 .next-old
// 6. 状态改成 ready；任何一步失败都是 failed，并记下日志的最后 60 行
// 设置了 REBUILD_COMMAND 时，用它代替第 3~5 步（测试里用一个很快的假命令）。
//
// 配置读环境变量，没有时读 .env.production.local / .env.local / .env.production / .env：
//   REBUILD_COMMAND、REBUILD_RESTART_CMD、REBUILD_STATUS_FILE（状态文件位置；锁、记号、日志放在它旁边）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..', '..');
const LIVE = path.join(ROOT, '.next');
const STAGING = path.join(ROOT, '.next-staging');
const OLD = path.join(ROOT, '.next-old');

const LOCK_STALE_MS = 30 * 60_000;
const HEARTBEAT_MS = 60_000;
/** 单个步骤最长运行时间：比锁失效的时间短，锁不会在构建还活着时被别人当成失效 */
const STEP_TIMEOUT_MS = 25 * 60_000;
const TAIL_LINES = 60;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const DEFAULT_RESTART = 'pm2 reload xhblogs --update-env';

// —— 参数与配置 ——

function parseArgs(argv) {
  const out = { worker: false, foreground: false, install: false, reason: '', requestedAt: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--worker') out.worker = true;
    else if (arg === '--foreground') out.foreground = true;
    else if (arg === '--install') out.install = true;
    else if (arg === '--reason') out.reason = argv[++i] ?? '';
    else if (arg === '--requested-at') out.requestedAt = Number(argv[++i]) || 0;
    else if (arg === '-h' || arg === '--help') {
      console.log('用法：node scripts/self-host/rebuild.mjs [--foreground] [--install] [--reason "说明"]（详见文件开头的说明）');
      process.exit(0);
    }
  }
  return out;
}

const ENV_FILES = ['.env.production.local', '.env.local', '.env.production', '.env'];

/** 读 .env 文件（排在前面的优先，和 Next 的顺序一致）：只认 KEY=VALUE，够这里用 */
function readEnvFiles() {
  const values = {};
  for (const name of ENV_FILES) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match || match[1] in values) continue;
      const raw = match[2].trim();
      const quoted = /^(['"`])([\s\S]*?)\1\s*(?:#.*)?$/.exec(raw);
      values[match[1]] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '');
    }
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
const fileEnv = readEnvFiles();
const config = (key) => (process.env[key] ?? fileEnv[key] ?? '').trim();

const STATUS_FILE = path.resolve(ROOT, config('REBUILD_STATUS_FILE') || '.rebuild-status.json');
const STATE_DIR = path.dirname(STATUS_FILE);
const LOCK = path.join(STATE_DIR, '.rebuild.lock');
const PENDING = path.join(STATE_DIR, '.rebuild.pending');
const LOG = path.join(STATE_DIR, '.rebuild.log');

// —— 第一层：再脱离一次就返回 ——
// 网站进程启动的是这一层。pm2 重启网站时会把网站进程的子进程一起结束，
// 真正干活的那一层由这里启动、这里马上退出，它就不再是网站的子进程，重启网站不会把构建自己也杀掉。
if (!args.worker && !args.foreground) {
  const passArgs = ['--requested-at', String(args.requestedAt || Date.now()), '--reason', args.reason || '手动重建'];
  if (args.install) passArgs.push('--install');
  const child = spawn(process.execPath, [SELF, '--worker', ...passArgs], { cwd: ROOT, detached: true, stdio: 'ignore', env: process.env, windowsHide: true });
  child.unref();
  console.log(`已经在后台开始重建。进度：${LOG}，状态：${STATUS_FILE}`);
  process.exit(0);
}

// —— 日志 ——

function log(line) {
  const text = `${line}\n`;
  try {
    fs.appendFileSync(LOG, text);
  } catch {
    /* 日志写不了也继续 */
  }
  if (args.foreground) process.stdout.write(text);
}

function rotateLog() {
  try {
    if (fs.statSync(LOG).size > MAX_LOG_BYTES) fs.renameSync(LOG, `${LOG}.old`);
  } catch {
    /* 还没有日志 */
  }
}

// —— 状态文件 ——

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeStatus(status) {
  const temp = `${STATUS_FILE}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, STATUS_FILE);
  } catch (error) {
    log(`写状态文件失败：${error.message}`);
  }
}

// —— 锁与「还有没做的」记号 ——

let heartbeat = null;

function lockIsStale() {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (typeof lock.at === 'number' && Date.now() - lock.at > LOCK_STALE_MS) return true;
    if (typeof lock.pid === 'number' && lock.pid > 0) {
      try {
        process.kill(lock.pid, 0);
        return false;
      } catch (error) {
        return error.code !== 'EPERM';
      }
    }
    return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    // 内容不完整（刚被创建）：按修改时间判断
    try {
      return Date.now() - fs.statSync(LOCK).mtimeMs > LOCK_STALE_MS;
    } catch {
      return true;
    }
  }
}

function tryLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      // 定时刷新锁的时间：构建再久，只要进程活着锁就不会被当成失效
      heartbeat = setInterval(() => {
        try {
          fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }));
        } catch {
          /* 下次再试 */
        }
      }, HEARTBEAT_MS);
      heartbeat.unref();
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (attempt === 0 && lockIsStale()) {
        log('上一次构建留下的锁已经失效，清掉');
        try {
          fs.unlinkSync(LOCK);
        } catch {
          /* 别人先清了 */
        }
        continue;
      }
      return false;
    }
  }
  return false;
}

function releaseLock() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (lock.pid === process.pid) fs.unlinkSync(LOCK);
  } catch {
    /* 已经不是自己的锁了 */
  }
}

function readPending() {
  try {
    return JSON.parse(fs.readFileSync(PENDING, 'utf8'));
  } catch (error) {
    return error.code === 'ENOENT' ? null : { at: Date.now() };
  }
}

function addPending(job) {
  const previous = readPending() ?? {};
  const mark = { ...previous, at: Math.max(Number(previous.at) || 0, job.requestedAt), reason: job.reason, install: Boolean(previous.install || job.install) };
  fs.writeFileSync(PENDING, `${JSON.stringify(mark)}\n`, 'utf8');
}

function takePending() {
  const mark = readPending();
  try {
    fs.unlinkSync(PENDING);
  } catch {
    /* 没有记号 */
  }
  return mark;
}

// —— 运行命令 ——

/** 给 next build 和重启命令的环境变量 */
function cleanEnv() {
  const env = { ...process.env };
  // 网站进程里来自 .env 文件的值是它启动时读进来的；去掉，让 next build / next start 重新从文件读，改了 .env.production.local 也能生效
  for (const key of Object.keys(fileEnv)) delete env[key];
  for (const key of Object.keys(env)) {
    // Next 运行时自己设的变量（其中 __NEXT_PROCESSED_ENV 会让下一个 Next 进程不再读 .env 文件）
    if (/^(__NEXT|NEXT_PRIVATE_)/.test(key) || ['NEXT_RUNTIME', 'NEXT_DEPLOYMENT_ID', 'TURBOPACK', 'NEXT_DIST_DIR'].includes(key)) delete env[key];
    // pm2 塞进网站进程的内部变量（pm_id、name、status……都是小写），别让 pm2 reload --update-env 当成新的环境变量；代理设置（http_proxy 等）保留
    else if (process.platform !== 'win32' && key === key.toLowerCase() && !/proxy$/.test(key)) delete env[key];
  }
  // npm、pm2 一般和 node 装在同一个目录（宝塔的 Node 版本管理器装在 /www/server/nodejs/版本/bin）
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = [path.dirname(process.execPath), env[pathKey]].filter(Boolean).join(path.delimiter);
  return env;
}

const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

/** 正在运行的命令（被中断时连同它启动的子进程一起结束） */
let activeChild = null;

function killChild(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    /* 已经结束 */
  }
}

function run(command, commandArgs, { env, shell = false, tail }) {
  return new Promise((resolve) => {
    log(`$ ${[command, ...commandArgs].join(' ')}`);
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    let child;
    try {
      // detached：单独一个进程组，超时时连同它启动的子进程一起结束
      child = spawn(command, commandArgs, { cwd: ROOT, env, shell, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
    } catch (error) {
      log(`运行失败：${error.message}`);
      tail.push(`运行失败：${error.message}`);
      resolve({ ok: false });
      return;
    }
    activeChild = child;
    const timer = setTimeout(() => {
      log(`超过 ${STEP_TIMEOUT_MS / 60_000} 分钟还没结束，停止`);
      tail.push('超时，已停止');
      killChild(child, 'SIGTERM');
      setTimeout(() => killChild(child, 'SIGKILL'), 10_000).unref();
    }, STEP_TIMEOUT_MS);
    let partial = '';
    const onData = (chunk) => {
      try {
        fs.appendFileSync(LOG, chunk);
      } catch {
        /* 忽略 */
      }
      if (args.foreground) process.stdout.write(chunk);
      const lines = (partial + stripAnsi(chunk.toString('utf8'))).split(/\r?\n/);
      partial = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) tail.push(line);
      if (tail.length > TAIL_LINES * 2) tail.splice(0, tail.length - TAIL_LINES);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      if (activeChild === child) activeChild = null;
      log(`运行失败：${error.message}`);
      tail.push(`运行失败：${error.message}`);
      done({ ok: false });
    });
    child.on('close', (code, signal) => {
      if (activeChild === child) activeChild = null;
      if (partial.trim()) tail.push(partial);
      if (code !== 0) log(`退出码 ${code ?? signal}`);
      done({ ok: code === 0 });
    });
  });
}

const exists = (p) => fs.existsSync(p);
const remove = (p) => fs.rmSync(p, { recursive: true, force: true });

/** 构建 + 换目录 + 重启；返回 { ok, message } */
async function steps(job, tail) {
  const env = cleanEnv();
  if (job.install) {
    // --include=dev：网站进程的 NODE_ENV=production 会让 npm 跳过 devDependencies，但构建要用到（tailwind 等）
    const installed = await run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], { env, tail });
    if (!installed.ok) return { ok: false, message: '安装依赖（npm ci）失败，线上还是之前的版本' };
  }

  const custom = config('REBUILD_COMMAND');
  if (custom) {
    const result = await run(custom, [], { env, shell: true, tail });
    return result.ok ? { ok: true } : { ok: false, message: `REBUILD_COMMAND 执行失败：${custom}` };
  }

  remove(STAGING);
  const built = await run('npm', ['run', 'build'], { env: { ...env, NEXT_DIST_DIR: '.next-staging' }, tail });
  if (!built.ok || !exists(path.join(STAGING, 'BUILD_ID'))) {
    remove(STAGING);
    return { ok: false, message: '构建失败，线上还是之前的版本（完整日志见 .rebuild.log）' };
  }

  // 换目录。两次改名之间没有 .next 的时间极短；正在运行的旧进程马上会被重启
  remove(OLD);
  const imageCache = path.join(LIVE, 'cache', 'images');
  const newImageCache = path.join(STAGING, 'cache', 'images');
  if (exists(imageCache) && !exists(newImageCache)) {
    try {
      fs.mkdirSync(path.dirname(newImageCache), { recursive: true });
      fs.renameSync(imageCache, newImageCache);
    } catch {
      /* 缓存而已 */
    }
  }
  try {
    if (exists(LIVE)) fs.renameSync(LIVE, OLD);
    fs.renameSync(STAGING, LIVE);
  } catch (error) {
    if (!exists(LIVE) && exists(OLD)) fs.renameSync(OLD, LIVE);
    return { ok: false, message: `换上新版本失败：${error.message}` };
  }
  log('新版本已换到 .next');

  const restart = config('REBUILD_RESTART_CMD') || DEFAULT_RESTART;
  const restarted = await run(restart, [], { env, shell: true, tail });
  if (!restarted.ok) {
    return {
      ok: false,
      message: `新版本已经构建好并换上了，但重启网站失败（${restart}）。请手动重启一次；想退回旧版本：删掉 .next，把 .next-old 改名回 .next，再重启`,
    };
  }
  remove(OLD);
  return { ok: true };
}

async function runJob(job) {
  rotateLog();
  const previous = readStatus();
  const previousRequested = Date.parse(previous.requestedAt ?? '') || 0;
  const base = {
    requestedAt: new Date(Math.max(job.requestedAt, previousRequested) || Date.now()).toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    reason: job.reason,
    log: '',
  };
  writeStatus({ state: 'building', ...base });
  // 记号在写完 building 之后才删：后台在这之间看到的一直是「还有修改没上线」，不会误以为已经上线了
  const mark = takePending();
  if (mark?.install) job.install = true;
  log(`\n==== ${base.startedAt} 开始重建：${job.reason}${job.install ? '（先安装依赖）' : ''}`);

  const tail = [];
  let result;
  try {
    result = await steps(job, tail);
  } catch (error) {
    result = { ok: false, message: `出错了：${error instanceof Error ? error.message : String(error)}` };
  }
  const finishedAt = new Date().toISOString();
  if (result.ok) {
    writeStatus({ state: 'ready', ...base, finishedAt });
    log(`==== ${finishedAt} 已上线`);
  } else {
    writeStatus({ state: 'failed', ...base, finishedAt, log: [result.message, '', ...tail.slice(-TAIL_LINES)].join('\n').trim() });
    log(`==== ${finishedAt} 失败：${result.message}`);
  }
  return result.ok;
}

// —— 第二层：干活 ——

let current = null;
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => {
    if (activeChild) killChild(activeChild, 'SIGTERM');
    if (current) {
      writeStatus({ ...readStatus(), state: 'failed', finishedAt: new Date().toISOString(), log: `重建进程收到 ${signal}，被中断了。线上应该还是之前的版本，可以再点一次「立即重建」` });
    }
    releaseLock();
    process.exit(1);
  });
}

async function main() {
  let job = { requestedAt: args.requestedAt || Date.now(), reason: args.reason || '手动重建', install: args.install };
  if (!tryLock()) {
    const status = readStatus();
    const started = Date.parse(status.startedAt ?? '') || 0;
    if (status.state === 'building' && started >= job.requestedAt && !job.install) {
      log(`${new Date().toISOString()} 正在进行的构建已经包含这次修改（${job.reason}）`);
      return true;
    }
    addPending(job);
    // 留下记号之后再试一次：万一那边刚好在这之间做完、已经检查过记号了
    if (!tryLock()) {
      log(`${new Date().toISOString()} 已有构建在进行，记下了（${job.reason}），那次做完会接着再构建一次`);
      if (args.foreground) console.log('已有构建在进行，做完后会自动再构建一次');
      return true;
    }
  }

  let ok = true;
  try {
    for (;;) {
      current = job;
      ok = await runJob(job);
      current = null;
      releaseLock();
      // 构建期间又有保存：再来一次（先放锁再看记号，和上面「先写记号再抢锁」配合，不会漏）
      const mark = readPending();
      if (!mark || !tryLock()) break;
      job = { requestedAt: Number(mark.at) || Date.now(), reason: mark.reason || '补上构建期间的修改', install: Boolean(mark.install) };
    }
  } finally {
    releaseLock();
  }
  return ok;
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (error) => {
    log(`重建脚本出错：${error?.stack || error}`);
    if (current) writeStatus({ ...readStatus(), state: 'failed', finishedAt: new Date().toISOString(), log: `重建脚本出错：${error?.message || error}` });
    releaseLock();
    process.exit(1);
  },
);
