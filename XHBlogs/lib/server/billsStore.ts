// lib/server/billsStore.ts —— 账单数据 data/bills.json 的读写与校验（仅服务端）
//
// - readBills()：公开的 /bills 页在构建时同步读（文件缺失、坏了都回退到默认值，页面照样能生成）
// - readBillsLatest()：后台读，走 getStorage()（线上读 GitHub 上最新的版本）
// - validateBills()：保存前的严格检查，出错抛 AdminInputError（中文说明，后台直接弹出来）
// - writeBills()：整份写回，一次提交
import fs from 'fs';
import path from 'path';
import { AdminInputError } from './admin/api';
import { getStorage } from './admin/storage';
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

/** 构建时读本地文件（公开页用） */
export function readBills(): BillsData {
  try {
    return coerceBills(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'bills.json'), 'utf8')) as unknown);
  } catch {
    return defaultBills();
  }
}

/** 后台用：读存储里最新的版本 */
export async function readBillsLatest(): Promise<BillsData> {
  const raw = await getStorage().readText(FILE);
  if (!raw) return defaultBills();
  try {
    return coerceBills(JSON.parse(raw) as unknown);
  } catch {
    return defaultBills();
  }
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

/** 整份写回；内容没变时不提交 */
export async function writeBills(data: BillsData): Promise<{ sha: string | null; changed: boolean }> {
  const storage = getStorage();
  const content = billsToText(data);
  if ((await storage.readText(FILE)) === content) return { sha: null, changed: false };
  const { sha } = await storage.commit([{ path: FILE, content }], `后台：更新账单（${data.entries.length} 笔）`);
  return { sha, changed: true };
}
