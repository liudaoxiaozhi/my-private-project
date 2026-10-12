// lib/billsCsv.ts —— 账单的 CSV 导出 / 导入（纯函数，后台浏览器端用）
//
// 列：日期,类型,分类,金额,备注
// - 日期 YYYY-MM-DD；类型「支出」或「收入」；分类填分类名（按类型对上后台里的分类）；金额是新加坡元，两位小数
// - 导出带 UTF-8 BOM，Excel 双击打开中文不乱码；导入时 BOM 可有可无，逗号分隔，字段可以用双引号包起来
import { BILL_TYPE_LABEL, MAX_NOTE, isValidAmount, isValidDate, newBillId, parseAmount } from './bills';
import type { BillEntry, BillType, BillsData } from './bills';

export const CSV_HEADER = ['日期', '类型', '分类', '金额', '备注'] as const;
const BOM = '﻿';

function cell(value: string): string {
  // 以 = + - @ 开头的文字在 Excel 里会被当成公式执行，前面垫一个 '（金额列是纯数字，不受影响）
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** 导出：entries 按传入顺序写出 */
export function billsToCsv(data: BillsData, entries: BillEntry[]): string {
  const name = new Map(data.categories.map((c) => [c.id, c.name]));
  const lines = [
    CSV_HEADER.join(','),
    ...entries.map((e) => [e.date, BILL_TYPE_LABEL[e.type], cell(name.get(e.category) ?? '未分类'), e.amount.toFixed(2), cell(e.note)].join(',')),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** 解析 CSV 文本：支持双引号、引号里的逗号和换行、"" 转义、CRLF；返回每行的单元格（去掉完全空白的行） */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const src = text.replace(/^﻿/, '');
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(field);
    if (cells.some((c) => c.trim() !== '')) rows.push({ line: rowLine, cells });
    cells = [];
    field = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (ch === ',') {
      cells.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else field += ch;
  }
  if (field !== '' || cells.length > 0) endRow();
  return rows;
}

const TYPE_BY_TEXT: Record<string, BillType> = { 支出: 'expense', 收入: 'income', expense: 'expense', income: 'income' };

/** 导出时加的防公式前缀，导入时去掉 */
const unguard = (s: string): string => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

/** 把 2026/9/5、2026-9-5 规整成 2026-09-05 */
function normalizeDate(s: string): string {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s.trim());
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : s.trim();
}

export interface CsvImport {
  /** 可以加进去的记账（已分配新 id） */
  entries: BillEntry[];
  /** 和已有记账（或文件里前面的行）完全一样、跳过的行数 */
  duplicates: number;
  /** 有问题、跳过的行 */
  invalid: { line: number; reason: string }[];
}

const fingerprint = (e: Pick<BillEntry, 'date' | 'type' | 'amount' | 'category' | 'note'>): string =>
  JSON.stringify([e.date, e.type, e.amount.toFixed(2), e.category, e.note]);

/** 解析导入的 CSV：对上分类、检查每一行；和已有记账完全相同的行算重复，不再加 */
export function importCsv(text: string, data: BillsData): CsvImport {
  const rows = parseCsv(text);
  const result: CsvImport = { entries: [], duplicates: 0, invalid: [] };
  if (rows.length === 0) return result;
  const header = rows[0].cells.map((c) => c.trim());
  const hasHeader = header[0] === CSV_HEADER[0] || /^date$/i.test(header[0] ?? '');
  const seen = new Set(data.entries.map(fingerprint));
  for (const { line, cells } of hasHeader ? rows.slice(1) : rows) {
    const [dateRaw = '', typeRaw = '', categoryRaw = '', amountRaw = '', ...noteParts] = cells;
    const bad = (reason: string) => result.invalid.push({ line, reason });
    const date = normalizeDate(dateRaw);
    if (!isValidDate(date)) {
      bad(`日期「${dateRaw.trim()}」不对，应为 YYYY-MM-DD`);
      continue;
    }
    const type = TYPE_BY_TEXT[typeRaw.trim()];
    if (!type) {
      bad(`类型「${typeRaw.trim()}」不对，应为「支出」或「收入」`);
      continue;
    }
    const amount = parseAmount(amountRaw);
    if (amount === null || !isValidAmount(amount)) {
      bad(`金额「${amountRaw.trim()}」不对，应为大于 0 的数字`);
      continue;
    }
    const categoryName = unguard(categoryRaw.trim());
    const category = data.categories.find((c) => c.type === type && c.name === categoryName);
    if (!category) {
      bad(`没有叫「${categoryName}」的${BILL_TYPE_LABEL[type]}分类（先在「分类与预算」里添加）`);
      continue;
    }
    // 备注里没加引号的逗号会把它拆成好几格，拼回去
    const note = unguard(noteParts.join(',').trim());
    if (note.length > MAX_NOTE) {
      bad(`备注超过 ${MAX_NOTE} 个字`);
      continue;
    }
    const entry: BillEntry = { id: newBillId('bill'), date, type, amount, category: category.id, note };
    const key = fingerprint(entry);
    if (seen.has(key)) {
      result.duplicates++;
      continue;
    }
    seen.add(key);
    result.entries.push(entry);
  }
  return result;
}
