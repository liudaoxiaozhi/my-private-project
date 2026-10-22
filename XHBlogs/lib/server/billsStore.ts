// lib/server/billsStore.ts —— 账单数据 data/bills.json 的读写与校验（仅服务端）
//
// - readBills()：公开的 /bills 页在构建时同步读（文件缺失、坏了、解不开都回退到默认值，页面照样能生成）
// - readBillsLatest()：后台读，走 getStorage()（线上读 GitHub 上最新的版本），同时告诉后台文件状态
// - validateBills()：保存前的严格检查，出错抛 AdminInputError（中文说明，后台直接弹出来）
// - writeBills()：整份加密写回，一次提交
//
// 加密：仓库里只存密文 { "encrypted": "v1:…" }，AES-256-GCM，钥匙和后台密钥相同（lib/server/admin/secrets.ts：
// ADMIN_SECRETS_KEY 优先，否则 ADMIN_PASSWORD）。旧的明文文件照样能读，下次保存自动变成密文；
// 后来才设置 ADMIN_SECRETS_KEY 的，管理员密码加密的旧文件也能读，下次保存时换成新钥匙。
// 解不开（钥匙变了）时公开页显示「还没有记账」，后台拒绝保存，免得用空账单覆盖掉原来的数据。
import fs from 'fs';
import path from 'path';
import { AdminInputError } from './admin/api';
import { getStorage } from './admin/storage';
import { cipherKey, encrypt, openSealed } from './admin/secrets';
import {
  BILL_TYPE_LABEL,
  MAX_AMOUNT,
  MAX_CATEGORY_NAME,
  MAX_NOTE,
  coerceBills,
  defaultBills,
  formatSGD,
  isValidDate,
  round2,
} from '../bills';
import type { BillCategory, BillEntry, BillType, BillsData } from '../bills';

const FILE = 'data/bills.json';
const MAX_ENTRIES = 50_000;
const MAX_CATEGORIES = 100;

const SEAL_VERSION = 'v1:';

/**
 * 文件状态：empty 还没有文件；plain 旧的明文；encrypted 密文已解开；
 * locked 解不开（钥匙变了 / 文件坏了）——这时不能保存，否则会覆盖掉原来的数据
 */
export type BillsFileState = 'empty' | 'plain' | 'encrypted' | 'locked';

/** legacy：密文是旧钥匙（管理员密码）加密的，下次保存时即使内容没变也要重新加密 */
export function openBills(raw: string | null): { bills: BillsData; state: BillsFileState; legacy?: boolean } {
  if (!raw || !raw.trim()) return { bills: defaultBills(), state: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { bills: defaultBills(), state: 'locked' };
  }
  if (isPlain(parsed) && typeof parsed.encrypted === 'string') {
    const sealed = parsed.encrypted;
    const opened = sealed.startsWith(SEAL_VERSION) ? openSealed(sealed.slice(SEAL_VERSION.length)) : null;
    if (opened === null) return { bills: defaultBills(), state: 'locked' };
    try {
      return { bills: coerceBills(JSON.parse(opened.text) as unknown), state: 'encrypted', legacy: opened.legacy };
    } catch {
      return { bills: defaultBills(), state: 'locked' };
    }
  }
  return { bills: coerceBills(parsed), state: 'plain' };
}

/** 加密成写进仓库的文件内容 */
export function sealBills(data: BillsData): string {
  const key = cipherKey();
  if (!key) throw new AdminInputError('没有设置 ADMIN_PASSWORD（或 ADMIN_SECRETS_KEY），账单无法加密保存');
  return `${JSON.stringify({ encrypted: SEAL_VERSION + encrypt(billsToText(data), key) }, null, 2)}\n`;
}

/** 构建时读本地文件（公开页用；解不开就当没有记账） */
export function readBills(): BillsData {
  try {
    return openBills(fs.readFileSync(path.join(process.cwd(), 'data', 'bills.json'), 'utf8')).bills;
  } catch {
    return defaultBills();
  }
}

/** 后台用：读存储里最新的版本，连同文件状态 */
export async function readBillsLatest(): Promise<{ bills: BillsData; state: BillsFileState; legacy?: boolean }> {
  return openBills(await getStorage().readText(FILE));
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isType = (v: unknown): v is BillType => v === 'expense' || v === 'income';
const ID_RE = /^[\w-]{1,64}$/;

/**
 * 严格检查整份账单，返回整理好的数据（金额保留两位、去掉多余字段、记账按日期倒序）。
 * previous：存储里现在的版本，用来在「删了还在用的分类」时说出分类名
 */
export function validateBills(input: unknown, previous?: BillsData): BillsData {
  if (!isPlain(input)) throw new AdminInputError('账单数据格式不对');
  const { categories: rawCategories, budget: rawBudget, entries: rawEntries } = input;

  // 分类
  if (!Array.isArray(rawCategories)) throw new AdminInputError('缺少分类列表');
  if (rawCategories.length > MAX_CATEGORIES) throw new AdminInputError(`分类太多了（最多 ${MAX_CATEGORIES} 个）`);
  const categoryIds = new Set<string>();
  const categoryNames = new Set<string>();
  const categories: BillCategory[] = rawCategories.map((c, i) => {
    if (!isPlain(c)) throw new AdminInputError(`第 ${i + 1} 个分类格式不对`);
    const id = typeof c.id === 'string' ? c.id.trim() : '';
    if (!id) throw new AdminInputError(`第 ${i + 1} 个分类缺少 id`);
    if (!ID_RE.test(id)) throw new AdminInputError(`分类 id「${id}」不合法（只能用字母、数字、- 和 _，最长 64 个字符）`);
    if (categoryIds.has(id)) throw new AdminInputError(`分类 id「${id}」重复了`);
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!name) throw new AdminInputError(`第 ${i + 1} 个分类没有名字`);
    if (name.length > MAX_CATEGORY_NAME) throw new AdminInputError(`分类名「${name}」太长了（最多 ${MAX_CATEGORY_NAME} 个字）`);
    if (categoryNames.has(name)) throw new AdminInputError(`分类名「${name}」重复了`);
    if (!isType(c.type)) throw new AdminInputError(`分类「${name}」的类型不对（只能是支出或收入）`);
    categoryIds.add(id);
    categoryNames.add(name);
    return { id, name, type: c.type };
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // 预算
  const monthlyRaw = isPlain(rawBudget) ? rawBudget.monthly : undefined;
  if (typeof monthlyRaw !== 'number' || !Number.isFinite(monthlyRaw) || monthlyRaw < 0 || monthlyRaw > MAX_AMOUNT) {
    throw new AdminInputError(`每月预算要填 0 到 ${formatSGD(MAX_AMOUNT)} 之间的数字（0 表示不设预算）`);
  }
  const budget = { monthly: round2(monthlyRaw) };

  // 记账
  if (!Array.isArray(rawEntries)) throw new AdminInputError('缺少记账列表');
  if (rawEntries.length > MAX_ENTRIES) throw new AdminInputError(`记账太多了（最多 ${MAX_ENTRIES} 笔）`);
  const entryIds = new Set<string>();
  const missing = new Map<string, number>();
  const entries: BillEntry[] = rawEntries.map((e, i) => {
    const where = `第 ${i + 1} 笔记账`;
    if (!isPlain(e)) throw new AdminInputError(`${where}格式不对`);
    const id = typeof e.id === 'string' ? e.id.trim() : '';
    if (!id) throw new AdminInputError(`${where}缺少 id`);
    if (!ID_RE.test(id)) throw new AdminInputError(`${where}的 id「${id}」不合法`);
    if (entryIds.has(id)) throw new AdminInputError(`记账 id「${id}」重复了`);
    entryIds.add(id);
    const label = isValidDate(e.date) ? `${e.date} 的那笔记账` : where;
    if (!isValidDate(e.date)) throw new AdminInputError(`${where}的日期「${String(e.date ?? '')}」不对，应为真实存在的 YYYY-MM-DD`);
    if (!isType(e.type)) throw new AdminInputError(`${label}的类型不对（只能是支出或收入）`);
    if (typeof e.amount !== 'number' || !Number.isFinite(e.amount)) throw new AdminInputError(`${label}的金额不是数字`);
    const amount = round2(e.amount);
    if (amount <= 0) throw new AdminInputError(`${label}的金额要大于 0`);
    if (amount > MAX_AMOUNT) throw new AdminInputError(`${label}的金额太大了（单笔最多 ${formatSGD(MAX_AMOUNT)}）`);
    const categoryId = typeof e.category === 'string' ? e.category : '';
    const category = categoryById.get(categoryId);
    if (!category) {
      missing.set(categoryId, (missing.get(categoryId) ?? 0) + 1);
    } else if (category.type !== e.type) {
      throw new AdminInputError(`${label}是${BILL_TYPE_LABEL[e.type]}，但分类「${category.name}」是${BILL_TYPE_LABEL[category.type]}分类`);
    }
    const note = e.note === undefined ? '' : typeof e.note === 'string' ? e.note.trim() : null;
    if (note === null) throw new AdminInputError(`${label}的备注格式不对`);
    if (note.length > MAX_NOTE) throw new AdminInputError(`${label}的备注太长了（最多 ${MAX_NOTE} 个字）`);
    return { id, date: e.date, type: e.type, amount, category: categoryId, note };
  });

  if (missing.size > 0) {
    const [id, count] = [...missing.entries()][0];
    const name = previous?.categories.find((c) => c.id === id)?.name;
    throw new AdminInputError(
      name
        ? `分类「${name}」还有 ${count} 笔记账在用，不能删除；先把这些记账改到别的分类`
        : `有 ${count} 笔记账的分类「${id || '（空）'}」不存在`,
    );
  }

  // 日期倒序；同一天保持原来的先后
  const order = new Map(entries.map((e, i) => [e.id, i]));
  entries.sort((a, b) => (a.date === b.date ? order.get(a.id)! - order.get(b.id)! : a.date < b.date ? 1 : -1));
  return { categories, budget, entries };
}

export const billsToText = (data: BillsData): string => `${JSON.stringify(data, null, 2)}\n`;

export const LOCKED_MESSAGE =
  '账单文件无法解密（可能改过管理员密码或 ADMIN_SECRETS_KEY）。为免覆盖原来的数据，现在不能保存；改回原来的密码 / 钥匙即可恢复，或用之前导出的 CSV 导入';

/** 整份加密写回；内容没变时不提交；现有文件解不开时拒绝（除非站长确认放弃旧账单） */
export async function writeBills(data: BillsData, { overwriteLocked = false } = {}): Promise<{ sha: string | null; changed: boolean }> {
  const storage = getStorage();
  const current = openBills(await storage.readText(FILE));
  if (current.state === 'locked' && !overwriteLocked) throw new AdminInputError(LOCKED_MESSAGE);
  // 已经是当前钥匙加密的密文且内容一样：不提交（每次加密结果都不同，所以比较解开后的内容）
  if (current.state === 'encrypted' && !current.legacy && billsToText(current.bills) === billsToText(data)) {
    return { sha: null, changed: false };
  }
  const { sha } = await storage.commit([{ path: FILE, content: sealBills(data) }], `后台：更新账单（${data.entries.length} 笔）`);
  return { sha, changed: true };
}
