// lib/server/admin/secrets.ts —— 网页后台保存的密钥：TMDB Key、Bangumi 令牌、Gemini Key（仅服务端）
//
// 线上（Vercel）的文件系统是只读的，没法像本地那样写进 .env.local，所以：
// - 后台填的密钥加密后存进仓库的 data/secrets.json（AES-256-GCM），随提交一起保存，仓库里只有密文
// - 加密用的钥匙由 ADMIN_SECRETS_KEY 派生；没配置时用 ADMIN_PASSWORD。所以改了管理员密码后，
//   之前存的密钥就解不开了，需要在后台重新填一次（后台会显示「需要重新填写」）
// - 后来才设置 ADMIN_SECRETS_KEY 的：之前用管理员密码加密的密文照样能解开（openSealed），下次保存时换成新钥匙
// - 读取顺序：环境变量优先（在 Vercel 里直接配置的照样能用），其次才是 data/secrets.json
// - 读到的结果在内存里缓存 5 分钟，免得每次搜索都去 GitHub 读文件
import crypto from 'crypto';
import { adminPassword } from './auth';
import { getStorage, storageInfo } from './storage';
import { setEnvValue } from '../envFile';

export const SECRET_NAMES = ['TMDB_API_KEY', 'BANGUMI_ACCESS_TOKEN', 'GEMINI_API_KEY'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export const isSecretName = (v: string): v is SecretName => (SECRET_NAMES as readonly string[]).includes(v);

const FILE = 'data/secrets.json';
const CACHE_MS = 5 * 60_000;

const deriveKey = (base: string): Buffer => crypto.createHash('sha256').update(`xhblogs-secrets:${base}`).digest();

/** 加密用的钥匙（ADMIN_SECRETS_KEY 优先，否则 ADMIN_PASSWORD）；账单（lib/server/billsStore.ts）也用它 */
export function cipherKey(): Buffer | null {
  const base = (process.env.ADMIN_SECRETS_KEY ?? '').trim() || adminPassword();
  return base ? deriveKey(base) : null;
}

/** 是否单独设置了 ADMIN_SECRETS_KEY（没设时钥匙跟着管理员密码走，改密码后旧密文就解不开了） */
export const hasDedicatedSecretsKey = (): boolean => (process.env.ADMIN_SECRETS_KEY ?? '').trim() !== '';

export function encrypt(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

/** 解不开（钥匙变了 / 内容坏了）时返回 null */
export function decrypt(sealed: string, key: Buffer): string | null {
  try {
    const raw = Buffer.from(sealed, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * 解开后台存的密文：先用当前钥匙；设置了 ADMIN_SECRETS_KEY 时再试管理员密码派生的旧钥匙
 * （设置之前存的密钥 / 账单照样能读）。legacy = 是旧钥匙解开的，保存时要换成当前钥匙。都解不开返回 null
 */
export function openSealed(sealed: string): { text: string; legacy: boolean } | null {
  const key = cipherKey();
  const text = key ? decrypt(sealed, key) : null;
  if (text !== null) return { text, legacy: false };
  const password = adminPassword();
  if (!hasDedicatedSecretsKey() || !password) return null;
  const old = decrypt(sealed, deriveKey(password));
  return old === null ? null : { text: old, legacy: true };
}

let cache: { at: number; sealed: Record<string, string> } | null = null;

async function readSealed(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.sealed;
  let sealed: Record<string, string> = {};
  try {
    if (storageInfo().kind !== 'none') {
      const parsed = JSON.parse((await getStorage().readText(FILE)) ?? '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) sealed = parsed as Record<string, string>;
    }
  } catch {
    /* 没有文件或读不到：当作没存 */
  }
  cache = { at: Date.now(), sealed };
  return sealed;
}

/** 取密钥：环境变量 → data/secrets.json；都没有时返回空字符串 */
export async function getSecret(name: SecretName): Promise<string> {
  const fromEnv = (process.env[name] ?? '').trim();
  if (fromEnv) return fromEnv;
  const sealed = (await readSealed())[name];
  return sealed ? (openSealed(sealed)?.text ?? '') : '';
}

export type SecretStatus = 'env' | 'stored' | 'unreadable' | 'none';

/** 后台显示用：每个密钥是在环境变量里、存在后台、存了但解不开，还是没有 */
export async function secretStatus(): Promise<Record<SecretName, SecretStatus>> {
  const sealed = await readSealed();
  const entries = SECRET_NAMES.map((name): [SecretName, SecretStatus] => {
    if ((process.env[name] ?? '').trim()) return [name, 'env'];
    if (!sealed[name]) return [name, 'none'];
    return [name, openSealed(sealed[name]) ? 'stored' : 'unreadable'];
  });
  return Object.fromEntries(entries) as Record<SecretName, SecretStatus>;
}

/**
 * 保存密钥（value 为空字符串表示删除）。
 * 本地开发且没接 GitHub 时照旧写进 .env.local；其余情况加密后提交 data/secrets.json
 */
export async function setSecret(name: SecretName, value: string): Promise<{ sha: string | null }> {
  if (process.env.NODE_ENV === 'development' && storageInfo().kind === 'local') {
    setEnvValue(name, value);
    return { sha: null };
  }
  const key = cipherKey();
  if (!key) throw new Error('没有配置 ADMIN_PASSWORD，没法加密保存');
  cache = null;
  const sealed = { ...(await readSealed()) };
  // 顺便把还是旧钥匙（管理员密码）加密的其他密钥换成当前钥匙
  for (const [other, text] of Object.entries(sealed)) {
    const opened = openSealed(text);
    if (opened?.legacy) sealed[other] = encrypt(opened.text, key);
  }
  if (value) sealed[name] = encrypt(value, key);
  else delete sealed[name];
  const result = await getStorage().commit(
    [{ path: FILE, content: `${JSON.stringify(sealed, null, 2)}\n` }],
    `后台：${value ? '更新' : '删除'}密钥 ${name}（已加密）`,
  );
  cache = { at: Date.now(), sealed };
  return result;
}
