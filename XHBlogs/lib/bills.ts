// lib/bills.ts —— 账单（个人记账）：类型、默认值、金额格式、汇总统计（纯函数，客户端 / 服务端通用）
//
// 数据在 data/bills.json，只在网页后台（登录后）编辑；公开的 /bills 页只拿汇总后的数字，
// 单笔金额和备注不会离开服务端（见 app/bills/page.tsx）。货币只有新加坡元（SGD）。
//
// 金额一律保留两位小数；求和时先换成「分」的整数再加，避免 0.1 + 0.2 这类浮点误差。

export type BillType = 'expense' | 'income';

export interface BillCategory {
  id: string;
  name: string;
  type: BillType;
}

export interface BillEntry {
  id: string;
  /** YYYY-MM-DD（按站点时区记的日子） */
  date: string;
  type: BillType;
  /** 新加坡元，两位小数，大于 0 */
  amount: number;
  /** 分类 id */
  category: string;
  note: string;
}

export interface BillsData {
  categories: BillCategory[];
  budget: { monthly: number };
  entries: BillEntry[];
}

export const BILL_TYPES: readonly BillType[] = ['expense', 'income'];
export const BILL_TYPE_LABEL: Record<BillType, string> = { expense: '支出', income: '收入' };

/** 单笔金额上限（新加坡元） */
export const MAX_AMOUNT = 10_000_000;
export const MAX_NOTE = 200;
export const MAX_CATEGORY_NAME = 20;

export const DEFAULT_CATEGORIES: readonly BillCategory[] = [
  { id: 'food', name: '餐饮', type: 'expense' },
  { id: 'transport', name: '交通', type: 'expense' },
  { id: 'housing', name: '住房', type: 'expense' },
  { id: 'shopping', name: '购物', type: 'expense' },
  { id: 'fun', name: '娱乐', type: 'expense' },
  { id: 'study', name: '学习', type: 'expense' },
  { id: 'medical', name: '医疗', type: 'expense' },
  { id: 'phone', name: '通讯', type: 'expense' },
  { id: 'other', name: '其他', type: 'expense' },
  { id: 'salary', name: '工资', type: 'income' },
  { id: 'scholarship', name: '奖学金', type: 'income' },
  { id: 'parttime', name: '兼职', type: 'income' },
  { id: 'invest', name: '理财', type: 'income' },
  { id: 'other-income', name: '其他收入', type: 'income' },
];

export function defaultBills(): BillsData {
  return { categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), budget: { monthly: 0 }, entries: [] };
}

// —— 数字与格式 ——

/** 四舍五入到两位小数（12.345 → 12.35；先按 12 位有效数字消掉 1234.4999999… 这种二进制误差） */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return n;
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(12)));
  return (Math.sign(n) * cents) / 100 || 0;
}

const toCents = (n: number): number => Math.round(Number((n * 100).toPrecision(12)));
const fromCents = (c: number): number => c / 100;

const sgdNumber = new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** S$1,234.50；负数 -S$1,234.50 */
export function formatSGD(n: number): string {
  const v = round2(n);
  return `${v < 0 ? '-' : ''}S$${sgdNumber.format(Math.abs(v))}`;
}

/** 坐标轴用的短格式：S$800、S$1.2k、S$15k、S$1.5m */
export function formatSGDCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const short = (v: number) => String(Number(v.toFixed(v >= 10 ? 0 : 1)));
  if (abs >= 1_000_000) return `${sign}S$${short(abs / 1_000_000)}m`;
  if (abs >= 1000) return `${sign}S$${short(abs / 1000)}k`;
  return `${sign}S$${Number(abs.toFixed(abs < 10 ? 2 : 0))}`;
}

/** 0.5599 → 56.0% */
export const formatPercent = (ratio: number, digits = 1): string => `${(ratio * 100).toFixed(digits)}%`;

/**
 * 把用户输入的金额变成数字：允许「S$1,234.5」「1234.50」「 12 」；不合法返回 null（不检查正负和上限）
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/^S\$/i, '').replace(/[,，\s]/g, '');
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : null;
}

/** 合法的单笔金额：大于 0、不超过上限（已保留两位小数） */
export const isValidAmount = (n: number): boolean => Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && round2(n) > 0;

// —— 日期 ——

const pad = (n: number): string => String(n).padStart(2, '0');

/** YYYY-MM-DD，并且是真实存在的日子（没有 2 月 30 日） */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 2100) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** 某个时区里「今天」的日期 YYYY-MM-DD；时区无效时用运行环境的本地时区 */
export function todayIn(timeZone?: string, at: Date = new Date()): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at);
  }
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return `${get('year')}-${pad(get('month'))}-${pad(get('day'))}`;
}

/** 某个时区里的当前月份 YYYY-MM */
export const currentMonthIn = (timeZone?: string, at?: Date): string => todayIn(timeZone, at).slice(0, 7);

export const isValidMonth = (s: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** '2026-10' 前后挪几个月 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** '2026-10' → 2026年10月 */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

/** '2026-10-09' → 2026年10月9日 */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

// —— 分类 ——

export const categoriesOf = (data: BillsData, type: BillType): BillCategory[] => data.categories.filter((c) => c.type === type);

export function categoryName(data: BillsData, id: string): string {
  return data.categories.find((c) => c.id === id)?.name ?? '未分类';
}

/** 每个分类被多少笔记账用着 */
export function categoryUsage(data: BillsData): Map<string, number> {
  const usage = new Map<string, number>();
  for (const e of data.entries) usage.set(e.category, (usage.get(e.category) ?? 0) + 1);
  return usage;
}

// —— 汇总 ——

export interface CategoryTotal {
  id: string;
  name: string;
  amount: number;
  /** 占这一类（收入或支出）总额的比例 0~1 */
  share: number;
}

export interface MonthTotals {
  /** 1~12 */
  month: number;
  income: number;
  expense: number;
}

export interface YearSummary {
  year: number;
  income: number;
  expense: number;
  balance: number;
  /** 结余 / 收入；没有收入时为 null */
  savingsRate: number | null;
  months: MonthTotals[];
  expenseByCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
  count: number;
}

export interface MonthSummary {
  /** YYYY-MM */
  month: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
  /** 每月预算；没设（0）时为 null */
  budget: number | null;
  /** 预算还剩多少（超支为负）；没设预算时为 null */
  budgetRemaining: number | null;
  /** 支出 / 预算；没设预算时为 null */
  budgetUsedRatio: number | null;
}

/** 有记账的年份，从新到旧 */
export function yearsWithData(data: BillsData): number[] {
  const years = new Set<number>();
  for (const e of data.entries) {
    const y = Number(e.date.slice(0, 4));
    if (Number.isInteger(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

function byCategory(data: BillsData, entries: BillEntry[]): CategoryTotal[] {
  const cents = new Map<string, number>();
  for (const e of entries) cents.set(e.category, (cents.get(e.category) ?? 0) + toCents(e.amount));
  const total = [...cents.values()].reduce((a, b) => a + b, 0);
  return [...cents.entries()]
    .map(([id, c]) => ({ id, name: categoryName(data, id), amount: fromCents(c), share: total > 0 ? c / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'zh-CN'));
}

export function summarizeYear(data: BillsData, year: number): YearSummary {
  const prefix = `${year}-`;
  const entries = data.entries.filter((e) => e.date.startsWith(prefix));
  const income = Array<number>(12).fill(0);
  const expense = Array<number>(12).fill(0);
  for (const e of entries) {
    const m = Number(e.date.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    (e.type === 'income' ? income : expense)[m] += toCents(e.amount);
  }
  const incomeTotal = income.reduce((a, b) => a + b, 0);
  const expenseTotal = expense.reduce((a, b) => a + b, 0);
  const balance = incomeTotal - expenseTotal;
  return {
    year,
    income: fromCents(incomeTotal),
    expense: fromCents(expenseTotal),
    balance: fromCents(balance),
    savingsRate: incomeTotal > 0 ? balance / incomeTotal : null,
    months: income.map((c, i) => ({ month: i + 1, income: fromCents(c), expense: fromCents(expense[i]) })),
    expenseByCategory: byCategory(data, entries.filter((e) => e.type === 'expense')),
    incomeByCategory: byCategory(data, entries.filter((e) => e.type === 'income')),
    count: entries.length,
  };
}

/** month：YYYY-MM */
export function monthSummary(data: BillsData, month: string): MonthSummary {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const e of data.entries) {
    if (!e.date.startsWith(`${month}-`)) continue;
    count++;
    if (e.type === 'income') income += toCents(e.amount);
    else expense += toCents(e.amount);
  }
  const budgetCents = toCents(data.budget.monthly);
  const hasBudget = budgetCents > 0;
  return {
    month,
    income: fromCents(income),
    expense: fromCents(expense),
    balance: fromCents(income - expense),
    count,
    budget: hasBudget ? fromCents(budgetCents) : null,
    budgetRemaining: hasBudget ? fromCents(budgetCents - expense) : null,
    budgetUsedRatio: hasBudget ? expense / budgetCents : null,
  };
}

/** 最近一笔记账的日期（YYYY-MM-DD）；没有记账时为 null */
export function latestEntryDate(data: BillsData): string | null {
  let latest: string | null = null;
  for (const e of data.entries) if (!latest || e.date > latest) latest = e.date;
  return latest;
}

/** 新的在前：日期倒序；同一天保持原来的先后（新加的排在前面） */
export function sortEntries(entries: BillEntry[]): BillEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date === b.e.date ? a.i - b.i : a.e.date < b.e.date ? 1 : -1))
    .map(({ e }) => e);
}

// —— 宽松读取 ——

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isType = (v: unknown): v is BillType => v === 'expense' || v === 'income';

/**
 * 把读到的 JSON 尽量整理成 BillsData（文件缺字段、手改坏了也能显示）。
 * 严格检查在保存时做（lib/server/billsStore.ts 的 validateBills）
 */
export function coerceBills(raw: unknown): BillsData {
  if (!isPlain(raw)) return defaultBills();
  const categories = Array.isArray(raw.categories)
    ? raw.categories.flatMap((c): BillCategory[] =>
        isPlain(c) && typeof c.id === 'string' && c.id && typeof c.name === 'string' && isType(c.type) ? [{ id: c.id, name: c.name, type: c.type }] : [],
      )
    : [];
  const monthly = isPlain(raw.budget) && typeof raw.budget.monthly === 'number' && Number.isFinite(raw.budget.monthly) && raw.budget.monthly > 0 ? round2(raw.budget.monthly) : 0;
  const entries = Array.isArray(raw.entries)
    ? raw.entries.flatMap((e): BillEntry[] => {
        if (!isPlain(e) || typeof e.id !== 'string' || !e.id || !isValidDate(e.date) || !isType(e.type)) return [];
        const amount = typeof e.amount === 'number' ? e.amount : typeof e.amount === 'string' ? Number(e.amount) : NaN;
        if (!Number.isFinite(amount) || amount <= 0) return [];
        return [{ id: e.id, date: e.date, type: e.type, amount: round2(amount), category: typeof e.category === 'string' ? e.category : '', note: typeof e.note === 'string' ? e.note : '' }];
      })
    : [];
  return { categories: categories.length > 0 ? categories : defaultBills().categories, budget: { monthly }, entries };
}

let idCounter = 0;
/** 生成一个 id（后台新加记账 / 分类用；一次导入几百行也不会撞） */
export const newBillId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${(idCounter++ % 1296).toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;

// —— 公开页用的统计（只有汇总数字） ——

/** 公开页的一年：只有合计、每月合计和支出分类合计，没有任何单笔金额、备注 */
export interface PublicYear {
  year: number;
  income: number;
  expense: number;
  balance: number;
  savingsRate: number | null;
  months: MonthTotals[];
  expenseByCategory: { name: string; amount: number; share: number }[];
}

export interface PublicBillsStats {
  /** 有记账的年份，从新到旧 */
  years: PublicYear[];
  /** 默认显示哪一年：当年有数据就是当年，否则最近有数据的一年 */
  defaultYear: number | null;
  /** 每月预算；没设为 0 */
  budget: number;
  /** 每个月的支出合计 YYYY-MM → 金额（「本月预算」用；设了预算才有） */
  monthExpense: Record<string, number>;
  /** 最近一笔记账的日期 */
  lastUpdated: string | null;
}

/**
 * 把账单变成公开页能看的统计。这是公开页拿到的全部数据：
 * 只挑汇总后的字段（不要直接把 summarizeYear 的结果整个传出去，以后加字段时容易漏出明细）
 */
export function buildPublicStats(data: BillsData, timeZone?: string, at?: Date): PublicBillsStats {
  const years = yearsWithData(data).map((year): PublicYear => {
    const s = summarizeYear(data, year);
    return {
      year,
      income: s.income,
      expense: s.expense,
      balance: s.balance,
      savingsRate: s.savingsRate,
      months: s.months.map(({ month, income, expense }) => ({ month, income, expense })),
      expenseByCategory: s.expenseByCategory.map(({ name, amount, share }) => ({ name, amount, share })),
    };
  });
  const thisYear = Number(todayIn(timeZone, at).slice(0, 4));
  const monthExpense: Record<string, number> = {};
  if (data.budget.monthly > 0) {
    for (const y of years) {
      for (const m of y.months) if (m.expense > 0) monthExpense[`${y.year}-${pad(m.month)}`] = m.expense;
    }
  }
  return {
    years,
    defaultYear: years.length === 0 ? null : years.some((y) => y.year === thisYear) ? thisYear : years[0].year,
    budget: data.budget.monthly > 0 ? round2(data.budget.monthly) : 0,
    monthExpense,
    lastUpdated: latestEntryDate(data),
  };
}
