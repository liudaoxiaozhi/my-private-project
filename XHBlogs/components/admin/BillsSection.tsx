"use client";
// components/admin/BillsSection.tsx —— 网页后台「账单」：记一笔、按月查看和修改、分类与预算、CSV 导入导出
//
// 整份 data/bills.json 在浏览器里编辑，点保存时一次提交（和照片墙、友链一样）。
// 单笔记账、备注只在这里（登录后）看得到；公开的 /bills 页只显示汇总统计。
// 「今天」「本月」按站点时区（siteConfig.timeZone）算，不按浏览器所在地。
import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api } from '../../lib/admin/client';
import type { SaveResult } from '../../lib/admin/client';
import {
  BILL_TYPE_LABEL,
  BILL_TYPES,
  MAX_CATEGORY_NAME,
  MAX_NOTE,
  categoriesOf,
  categoryUsage,
  currentMonthIn,
  formatPercent,
  formatSGD,
  isValidAmount,
  isValidDate,
  monthLabel,
  monthSummary,
  newBillId,
  parseAmount,
  shiftMonth,
  sortEntries,
  todayIn,
} from '../../lib/bills';
import type { BillCategory, BillEntry, BillType, BillsData } from '../../lib/bills';
import { billsToCsv, importCsv } from '../../lib/billsCsv';
import type { CsvImport } from '../../lib/billsCsv';
import { siteConfig } from '../../siteConfig';
import { Button, ConfirmButton, Empty, Loading, Panel, SaveBar, inputClass, useAdmin, useLoader } from './ui';

const TZ = siteConfig.timeZone;
const LAST_CATEGORY_KEY = 'admin-bills-last-category';

/** 表格里用的紧凑输入框 */
const cellInput =
  'admin-input w-full min-w-0 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-indigo-400/70';

const TYPE_TEXT: Record<BillType, string> = { expense: 'text-orange-300', income: 'text-teal-300' };

type Updater = (fn: (d: BillsData) => BillsData) => void;

const AMOUNT_ERROR = '金额要填大于 0 的数字（单位 S$，最多两位小数）';

export default function BillsSection() {
  const [original, setOriginal] = useState<BillsData | null>(null);
  const [draft, setDraft] = useState<BillsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'entries' | 'settings'>('entries');
  /** 重新载入 / 撤销 / 保存后加一，让输入框按新数据重新初始化 */
  const [revision, setRevision] = useState(0);
  /** 仓库里的账单文件解不开（钥匙变了）：默认不能保存；读者确认放弃旧账单后才允许覆盖 */
  const [locked, setLocked] = useState(false);
  const [overwriteLocked, setOverwriteLocked] = useState(false);
  /** 是否单独设置了 ADMIN_SECRETS_KEY（没设时改管理员密码会让账单解不开） */
  const [secretsKey, setSecretsKey] = useState(true);
  const { toast, saved } = useAdmin();

  const reload = useLoader<{ bills: BillsData; state?: string; secretsKey?: boolean }>(
    '/api/admin/bills',
    (d) => {
      setOriginal(d.bills);
      setDraft(d.bills);
      setFailed(false);
      setLocked(d.state === 'locked');
      setOverwriteLocked(false);
      setSecretsKey(d.secretsKey !== false);
      setRevision((r) => r + 1);
    },
    () => setFailed(true),
  );

  if (!original || !draft) {
    return (
      <Panel title="账单">
        {failed ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-slate-300">
            账单读取失败（为免覆盖已有数据，读不到时不能编辑）
            <Button tone="indigo" onClick={reload}>重试</Button>
          </div>
        ) : (
          <Loading />
        )}
      </Panel>
    );
  }

  const update: Updater = (fn) => setDraft((d) => (d ? fn(d) : d));
  const changes = diffBills(original, draft);
  const dirty = changes.total > 0;

  const save = async () => {
    const sent = draft;
    setSaving(true);
    try {
      const res = await api<SaveResult & { bills: BillsData }>('/api/admin/bills', { method: 'PUT', body: { bills: sent, overwriteLocked } });
      setLocked(false);
      setOverwriteLocked(false);
      setOriginal(res.bills);
      // 保存期间又改了的话保留新的改动
      setDraft((d) => (d === sent ? res.bills : d));
      setRevision((r) => r + 1);
      saved(res, '账单已保存');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="账单"
      subtitle="单笔记账和备注只在后台可见；公开的「账单」页只显示年度、每月和分类的汇总统计。货币：新加坡元（S$）"
      actions={
        <div role="tablist" aria-label="账单视图" className="flex gap-1 rounded-xl bg-black/20 p-1">
          {(
            [
              ['entries', '记账'],
              ['settings', '分类与预算'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${tab === id ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {locked && (
        <div role="alert" className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-bold">账单文件无法解密</p>
          <p className="mt-1 text-rose-100/80">
            可能改过管理员密码或 ADMIN_SECRETS_KEY。改回原来的密码 / 钥匙后点「重新读取」就能恢复；为免覆盖原来的数据，现在保存会被拒绝。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button tone="indigo" onClick={reload}>重新读取</Button>
            {overwriteLocked ? (
              <span className="text-xs text-rose-100/80">已确认放弃旧账单：下次保存会用现在的内容覆盖它（无法恢复）</span>
            ) : (
              <ConfirmButton label="确定放弃？无法恢复" onConfirm={() => setOverwriteLocked(true)}>
                放弃旧账单，重新开始
              </ConfirmButton>
            )}
          </div>
        </div>
      )}
      {!secretsKey && !locked && (
        <div className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
          账单加密保存在仓库里，钥匙现在跟着管理员密码走：<b>改管理员密码前</b>请先在服务器 / Vercel 的环境变量里设置 <code>ADMIN_SECRETS_KEY</code>（一串随机长字符，设好后不要再改），
          并在「记账」里导出一份 CSV 备份。设好后已有的账单照样能读，下次保存时自动换成新钥匙；换好之前改密码，旧账单会解不开。
        </div>
      )}
      {tab === 'entries' ? <EntriesTab draft={draft} update={update} /> : <SettingsTab key={revision} draft={draft} update={update} />}
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        onReset={() => {
          setDraft(original);
          setRevision((r) => r + 1);
        }}
        note={changes.text}
      />
    </Panel>
  );
}

/** 和已保存的版本比：新增、修改、删除了几笔，分类 / 预算有没有改 */
function diffBills(a: BillsData, b: BillsData): { total: number; text: string } {
  const before = new Map(a.entries.map((e) => [e.id, JSON.stringify(e)]));
  const afterIds = new Set(b.entries.map((e) => e.id));
  let added = 0;
  let changed = 0;
  for (const e of b.entries) {
    const old = before.get(e.id);
    if (old === undefined) added++;
    else if (old !== JSON.stringify(e)) changed++;
  }
  const removed = a.entries.filter((e) => !afterIds.has(e.id)).length;
  const settings = JSON.stringify([a.categories, a.budget]) !== JSON.stringify([b.categories, b.budget]);
  const parts = [added && `新增 ${added} 笔`, changed && `修改 ${changed} 笔`, removed && `删除 ${removed} 笔`, settings && '分类 / 预算有改动'].filter(Boolean);
  return { total: added + changed + removed + (settings ? 1 : 0), text: `未保存：${parts.join('、')}（点保存后一次提交）` };
}

function readLastCategories(): Partial<Record<BillType, string>> {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_CATEGORY_KEY) || '{}') as unknown;
    return typeof v === 'object' && v !== null ? (v as Partial<Record<BillType, string>>) : {};
  } catch {
    return {};
  }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// —— 记账 ——

function EntriesTab({ draft, update }: { draft: BillsData; update: Updater }) {
  const { toast } = useAdmin();
  const [month, setMonth] = useState(() => currentMonthIn(TZ));
  const [typeFilter, setTypeFilter] = useState<'all' | BillType>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [pending, setPending] = useState<(CsvImport & { file: string }) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const thisMonth = currentMonthIn(TZ);
  const summary = monthSummary(draft, month);
  const monthEntries = sortEntries(draft.entries.filter((e) => e.date.startsWith(`${month}-`)));
  const kw = keyword.trim().toLowerCase();
  const visible = monthEntries.filter(
    (e) => (typeFilter === 'all' || e.type === typeFilter) && (categoryFilter === 'all' || e.category === categoryFilter) && (!kw || e.note.toLowerCase().includes(kw)),
  );
  const filtered = typeFilter !== 'all' || categoryFilter !== 'all' || kw !== '';

  const setEntry = (id: string, patch: Partial<BillEntry>) => update((d) => ({ ...d, entries: d.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const addEntry = (entry: BillEntry) => {
    update((d) => ({ ...d, entries: [entry, ...d.entries] }));
    const m = entry.date.slice(0, 7);
    if (m !== month) {
      setMonth(m);
      toast(`已记在 ${monthLabel(m)}`, 'info');
    }
  };

  const duplicate = (e: BillEntry) => {
    const today = todayIn(TZ);
    update((d) => ({ ...d, entries: [{ ...e, id: newBillId('bill'), date: today }, ...d.entries] }));
    toast(today.startsWith(month) ? '已复制到今天' : `已复制到今天（${monthLabel(today.slice(0, 7))}）`, 'info');
  };

  const pickCsv = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = importCsv(await file.text(), draft);
      setPending({ ...result, file: file.name });
    } catch {
      toast('读取 CSV 失败', 'error');
    }
  };

  const merge = () => {
    if (!pending) return;
    const added = pending.entries;
    update((d) => ({ ...d, entries: [...added, ...d.entries] }));
    toast(`已合并 ${added.length} 笔，记得点保存`, 'ok');
    setPending(null);
  };

  const exportCsv = (all: boolean) => {
    const entries = all ? sortEntries(draft.entries) : monthEntries;
    if (entries.length === 0) return toast(all ? '还没有记账' : '这个月还没有记账', 'info');
    download(all ? 'bills-all.csv' : `bills-${month}.csv`, billsToCsv(draft, entries));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 月份 + 本月汇总 */}
      <div className="admin-row flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button tone="ghost" aria-label="上个月" onClick={() => setMonth((m) => shiftMonth(m, -1))}>←</Button>
          <span className="min-w-[7.5rem] text-center text-lg font-black text-white" aria-live="polite">{monthLabel(month)}</span>
          <Button tone="ghost" aria-label="下个月" onClick={() => setMonth((m) => shiftMonth(m, 1))}>→</Button>
          {month !== thisMonth && <Button tone="indigo" onClick={() => setMonth(thisMonth)}>回到本月</Button>}
          <span className="admin-hint ml-auto text-xs">本月 {summary.count} 笔</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <Figure label="本月收入" value={formatSGD(summary.income)} tone="text-teal-300" />
          <Figure label="本月支出" value={formatSGD(summary.expense)} tone="text-orange-300" />
          <Figure label="结余" value={formatSGD(summary.balance)} tone={summary.balance < 0 ? 'text-rose-300' : 'text-white'} />
        </div>
        {summary.budget !== null && summary.budgetUsedRatio !== null && summary.budgetRemaining !== null && (
          <div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-300">
              <span>预算 {formatSGD(summary.budget)} · 已用 {formatPercent(summary.budgetUsedRatio, 0)}</span>
              <span className={summary.budgetRemaining < 0 ? 'font-bold text-rose-300' : ''}>
                {summary.budgetRemaining < 0 ? `超支 ${formatSGD(-summary.budgetRemaining)}` : `还剩 ${formatSGD(summary.budgetRemaining)}`}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label="本月预算已用"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(summary.budgetUsedRatio, 1) * 100)}
            >
              <div
                className={`h-full rounded-full ${summary.budgetUsedRatio > 1 ? 'bg-rose-500' : summary.budgetUsedRatio >= 0.8 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                style={{ width: `${Math.min(summary.budgetUsedRatio, 1) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <QuickAdd draft={draft} onAdd={addEntry} />

      {/* 筛选 + CSV */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-28 flex-col gap-1">
          <span className="admin-hint text-[11px]">类型</span>
          <select aria-label="按类型筛选" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as 'all' | BillType); setCategoryFilter('all'); }} className={cellInput}>
            <option value="all" className="bg-slate-800">全部</option>
            {BILL_TYPES.map((t) => <option key={t} value={t} className="bg-slate-800">{BILL_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="admin-hint text-[11px]">分类</span>
          <select aria-label="按分类筛选" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={cellInput}>
            <option value="all" className="bg-slate-800">全部分类</option>
            {draft.categories
              .filter((c) => typeFilter === 'all' || c.type === typeFilter)
              .map((c) => <option key={c.id} value={c.id} className="bg-slate-800">{c.name}{typeFilter === 'all' ? `（${BILL_TYPE_LABEL[c.type]}）` : ''}</option>)}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="admin-hint text-[11px]">备注关键词</span>
          <input type="search" aria-label="按备注搜索" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索备注" className={cellInput} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <Button tone="ghost" onClick={() => exportCsv(false)}>导出本月 CSV</Button>
          <Button tone="ghost" onClick={() => exportCsv(true)}>导出全部 CSV</Button>
          <Button tone="indigo" onClick={() => fileInput.current?.click()}>导入 CSV</Button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void pickCsv(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>

      {pending && (
        <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4 text-sm text-slate-100" role="region" aria-label="导入预览">
          <p>
            「{pending.file}」：可导入 <b>{pending.entries.length}</b> 笔
            {pending.duplicates > 0 && `，${pending.duplicates} 笔和已有记账重复已跳过`}
            {pending.invalid.length > 0 && `，${pending.invalid.length} 行有问题已跳过`}
          </p>
          {pending.invalid.length > 0 && (
            <ul className="admin-hint mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs">
              {pending.invalid.slice(0, 50).map((x) => <li key={x.line}>第 {x.line} 行：{x.reason}</li>)}
            </ul>
          )}
          <p className="admin-hint mt-2 text-[11px]">格式：日期,类型,分类,金额,备注（第一行是表头；分类填后台里已有的分类名）</p>
          <div className="mt-3 flex gap-2">
            <Button tone="primary" disabled={pending.entries.length === 0} onClick={merge}>合并 {pending.entries.length} 笔</Button>
            <Button tone="ghost" onClick={() => setPending(null)}>取消</Button>
          </div>
        </div>
      )}

      {/* 本月记账 */}
      <div className="flex flex-col gap-2" role="list" aria-label={`${monthLabel(month)}的记账`}>
        <div className="admin-hint hidden grid-cols-[9.5rem_5.5rem_7.5rem_8rem_minmax(0,1fr)_auto] gap-2 px-3 text-[11px] font-bold md:grid">
          <span>日期</span>
          <span>类型</span>
          <span>分类</span>
          <span>金额（S$）</span>
          <span>备注</span>
          <span className="w-[7.5rem]" />
        </div>
        {visible.length === 0 && <Empty>{filtered && monthEntries.length > 0 ? '没有符合筛选的记账' : '这个月还没有记账，用上面的「记一笔」添加'}</Empty>}
        {visible.map((e) => (
          <EntryRow key={e.id} entry={e} draft={draft} onChange={(patch) => setEntry(e.id, patch)} onDuplicate={() => duplicate(e)} onDelete={() => update((d) => ({ ...d, entries: d.entries.filter((x) => x.id !== e.id) }))} />
        ))}
        {filtered && monthEntries.length > 0 && <p className="admin-hint px-1 text-[11px]">筛选后 {visible.length} / {monthEntries.length} 笔</p>}
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 rounded-xl bg-black/20 px-3 py-2 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5 sm:py-2.5">
      <span className="admin-hint text-[11px]">{label}</span>
      <span className={`min-w-0 truncate font-lab text-base font-black tabular-nums sm:max-w-full sm:text-lg ${tone}`}>{value}</span>
    </div>
  );
}

/** 表格的一格：窄屏上方显示小标题，宽屏只给读屏用 */
function Cell({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="admin-hint text-[10px] md:sr-only">{label}</span>
      {children}
    </label>
  );
}

function QuickAdd({ draft, onAdd }: { draft: BillsData; onAdd: (e: BillEntry) => void }) {
  const { toast } = useAdmin();
  const [date, setDate] = useState(() => todayIn(TZ));
  const [type, setType] = useState<BillType>('expense');
  const [amount, setAmount] = useState('');
  const [last, setLast] = useState(readLastCategories);
  const [note, setNote] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  const options = categoriesOf(draft, type);
  // 上次用的分类（被删了就用这一类的第一个）
  const remembered = last[type];
  const category = options.some((c) => c.id === remembered) ? remembered! : (options[0]?.id ?? '');

  const setCategory = (id: string) => {
    const next = { ...last, [type]: id };
    setLast(next);
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, JSON.stringify(next));
    } catch {
      /* 忽略 */
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value === null || !isValidAmount(value)) return toast(AMOUNT_ERROR, 'error');
    if (!isValidDate(date)) return toast('日期不对', 'error');
    if (!category) return toast(`还没有${BILL_TYPE_LABEL[type]}分类，先去「分类与预算」添加`, 'error');
    if (note.trim().length > MAX_NOTE) return toast(`备注最多 ${MAX_NOTE} 个字`, 'error');
    onAdd({ id: newBillId('bill'), date, type, amount: value, category, note: note.trim() });
    setCategory(category);
    setAmount('');
    setNote('');
    amountRef.current?.focus();
  };

  return (
    <form onSubmit={submit} aria-label="记一笔" className="admin-row grid grid-cols-2 items-end gap-2 p-4 sm:p-5 md:grid-cols-[9.5rem_auto_7.5rem_8rem_minmax(0,1fr)_auto]">
      <h3 className="col-span-2 text-sm font-black text-indigo-200 md:col-span-6">记一笔</h3>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="admin-hint text-[10px]">日期</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cellInput} required />
      </label>
      <div className="flex flex-col gap-1">
        <span className="admin-hint text-[10px]">类型</span>
        <div role="group" aria-label="类型" className="flex rounded-lg bg-black/20 p-0.5">
          {BILL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${type === t ? (t === 'expense' ? 'bg-orange-600 text-white' : 'bg-teal-600 text-white') : 'text-slate-300 hover:bg-white/5'}`}
            >
              {BILL_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="admin-hint text-[10px]">分类</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={cellInput}>
          {options.map((c) => <option key={c.id} value={c.id} className="bg-slate-800">{c.name}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="admin-hint text-[10px]">金额</span>
        <input ref={amountRef} inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="S$ 0.00" className={`${cellInput} font-lab tabular-nums`} />
      </label>
      <label className="col-span-2 flex min-w-0 flex-col gap-1 md:col-span-1">
        <span className="admin-hint text-[10px]">备注</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} placeholder="可不填，只在后台可见" className={cellInput} />
      </label>
      <Button type="submit" tone="primary" className="col-span-2 py-2 md:col-span-1">添加</Button>
    </form>
  );
}

function EntryRow({
  entry,
  draft,
  onChange,
  onDuplicate,
  onDelete,
}: {
  entry: BillEntry;
  draft: BillsData;
  onChange: (patch: Partial<BillEntry>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const options = categoriesOf(draft, entry.type);
  return (
    <div
      role="listitem"
      aria-label={`${entry.date} ${BILL_TYPE_LABEL[entry.type]} ${formatSGD(entry.amount)}`}
      className="admin-row grid grid-cols-2 items-end gap-2 p-3 md:grid-cols-[9.5rem_5.5rem_7.5rem_8rem_minmax(0,1fr)_auto] md:items-center"
    >
      <Cell label="日期">
        <input
          type="date"
          value={entry.date}
          onChange={(e) => {
            if (isValidDate(e.target.value)) onChange({ date: e.target.value });
          }}
          className={cellInput}
        />
      </Cell>
      <Cell label="类型">
        <select
          value={entry.type}
          onChange={(e) => {
            const type = e.target.value as BillType;
            const keep = draft.categories.some((c) => c.id === entry.category && c.type === type);
            onChange({ type, category: keep ? entry.category : (categoriesOf(draft, type)[0]?.id ?? '') });
          }}
          className={`${cellInput} ${TYPE_TEXT[entry.type]}`}
        >
          {BILL_TYPES.map((t) => <option key={t} value={t} className="bg-slate-800 text-slate-100">{BILL_TYPE_LABEL[t]}</option>)}
        </select>
      </Cell>
      <Cell label="分类">
        <select value={entry.category} onChange={(e) => onChange({ category: e.target.value })} className={cellInput}>
          {!options.some((c) => c.id === entry.category) && <option value={entry.category} className="bg-slate-800">（分类不存在）</option>}
          {options.map((c) => <option key={c.id} value={c.id} className="bg-slate-800">{c.name}</option>)}
        </select>
      </Cell>
      <Cell label="金额">
        <AmountInput key={entry.amount} value={entry.amount} onCommit={(amount) => onChange({ amount })} />
      </Cell>
      <Cell label="备注" className="col-span-2 md:col-span-1">
        <input value={entry.note} onChange={(e) => onChange({ note: e.target.value })} maxLength={MAX_NOTE} placeholder="（无备注）" className={cellInput} />
      </Cell>
      <div className="col-span-2 flex justify-end gap-1.5 md:col-span-1 md:w-[7.5rem]">
        <Button tone="ghost" onClick={onDuplicate} title="复制一笔到今天">复制</Button>
        <ConfirmButton label="确定？" onConfirm={onDelete}>删除</ConfirmButton>
      </div>
    </div>
  );
}

/** 金额：输入时只改文字，离开输入框或按回车时才检查并写回；不合法就恢复原值 */
function AmountInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const { toast } = useAdmin();
  const [text, setText] = useState(value.toFixed(2));
  const commit = () => {
    const v = parseAmount(text);
    if (v === null || !isValidAmount(v)) {
      toast(AMOUNT_ERROR, 'error');
      setText(value.toFixed(2));
      return;
    }
    if (v !== value) onCommit(v);
    else setText(value.toFixed(2));
  };
  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      className={`${cellInput} font-lab tabular-nums`}
    />
  );
}

// —— 分类与预算 ——

function SettingsTab({ draft, update }: { draft: BillsData; update: Updater }) {
  const { toast } = useAdmin();
  const usage = categoryUsage(draft);
  const [budgetText, setBudgetText] = useState(draft.budget.monthly ? draft.budget.monthly.toFixed(2) : '');
  const [budgetError, setBudgetError] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<BillType>('expense');

  const changeBudget = (text: string) => {
    setBudgetText(text);
    if (text.trim() === '') {
      setBudgetError('');
      update((d) => ({ ...d, budget: { monthly: 0 } }));
      return;
    }
    const v = parseAmount(text);
    if (v === null || v < 0 || v > 10_000_000) {
      setBudgetError('请填 0 或正数');
      return;
    }
    setBudgetError('');
    update((d) => ({ ...d, budget: { monthly: v } }));
  };

  const rename = (id: string, name: string) => update((d) => ({ ...d, categories: d.categories.map((c) => (c.id === id ? { ...c, name } : c)) }));

  const remove = (c: BillCategory) => {
    const used = usage.get(c.id) ?? 0;
    if (used > 0) {
      toast(`「${c.name}」还有 ${used} 笔记账在用，不能删除；先把这些记账改到别的分类`, 'error');
      return;
    }
    update((d) => ({ ...d, categories: d.categories.filter((x) => x.id !== c.id) }));
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return toast('分类名不能为空', 'error');
    if (name.length > MAX_CATEGORY_NAME) return toast(`分类名最多 ${MAX_CATEGORY_NAME} 个字`, 'error');
    if (draft.categories.some((c) => c.name === name)) return toast(`已经有「${name}」这个分类了`, 'error');
    update((d) => ({ ...d, categories: [...d.categories, { id: newBillId('cat'), name, type: newType }] }));
    setNewName('');
  };

  const names = draft.categories.map((c) => c.name.trim());

  return (
    <div className="flex flex-col gap-6">
      <div className="admin-row flex flex-col gap-2 p-4 sm:p-5">
        <label className="flex max-w-xs flex-col gap-1.5">
          <span className="text-xs font-bold tracking-wide text-slate-300">每月预算（S$）</span>
          <input inputMode="decimal" value={budgetText} onChange={(e) => changeBudget(e.target.value)} placeholder="不设预算就留空" className={inputClass} />
        </label>
        <span className={`text-[11px] ${budgetError ? 'text-rose-300' : 'admin-hint'}`}>
          {budgetError || '设了预算后，后台和公开页会显示本月预算用了多少（公开页只显示总额和进度）'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {BILL_TYPES.map((type) => (
          <div key={type} className="flex flex-col gap-2">
            <h3 className={`text-sm font-black ${TYPE_TEXT[type]}`}>{BILL_TYPE_LABEL[type]}分类</h3>
            {categoriesOf(draft, type).map((c) => {
              const used = usage.get(c.id) ?? 0;
              const name = c.name.trim();
              const problem = !name ? '名字不能为空' : name.length > MAX_CATEGORY_NAME ? `最多 ${MAX_CATEGORY_NAME} 个字` : names.filter((n) => n === name).length > 1 ? '名字重复了' : '';
              return (
                <div key={c.id} role="group" aria-label={`分类 ${c.name}`} className="admin-row flex flex-wrap items-center gap-2 px-3 py-2">
                  <input aria-label="分类名" value={c.name} onChange={(e) => rename(c.id, e.target.value)} className={`${cellInput} min-w-[6rem] flex-1 ${problem ? 'ring-2 ring-rose-400/70' : ''}`} />
                  <span className="admin-hint w-14 shrink-0 text-right text-[11px] tabular-nums">{used} 笔</span>
                  {used > 0 ? (
                    <Button tone="rose" onClick={() => remove(c)} title="还有记账在用，不能删除" className="opacity-60">删除</Button>
                  ) : (
                    <ConfirmButton label="确定？" onConfirm={() => remove(c)}>删除</ConfirmButton>
                  )}
                  {problem && <span className="w-full text-[11px] text-rose-300">{problem}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <form onSubmit={add} aria-label="添加分类" className="admin-row flex flex-wrap items-end gap-2 p-4 sm:p-5">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="admin-hint text-[11px]">新分类名</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={MAX_CATEGORY_NAME} placeholder="比如：旅行" className={cellInput} />
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className="admin-hint text-[11px]">类型</span>
          <select value={newType} onChange={(e) => setNewType(e.target.value as BillType)} className={cellInput}>
            {BILL_TYPES.map((t) => <option key={t} value={t} className="bg-slate-800">{BILL_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <Button type="submit" tone="indigo" className="py-2">添加分类</Button>
      </form>
    </div>
  );
}
