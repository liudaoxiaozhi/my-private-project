"use client";
// app/bills/BillsDashboard.tsx —— 账单页的统计面板：年份切换、年度合计、每月收支柱状图、支出分类、本月预算
//
// 只接收汇总数字（PublicBillsStats），没有单笔明细。
// 配色：收入 teal-600、支出 orange-600（两个固定色，不跟随会变色相的强调色；色盲可分、浅色深色背景对比度都够，
// 并且始终配图例文字）。数值文字一律用正文颜色，颜色只用来区分系列。
import { useState } from 'react';
import { CalendarClock, PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import PageHeader, { FilterChip } from '../../components/PageHeader';
import { currentMonthIn, dateLabel, formatPercent, formatSGD, formatSGDCompact, monthLabel } from '../../lib/bills';
import type { PublicBillsStats, PublicYear } from '../../lib/bills';
import { useIsClient } from '../../lib/useIsClient';

const INCOME_FILL = 'fill-teal-600';
const EXPENSE_FILL = 'fill-orange-600';
const INCOME_BG = 'bg-teal-600';
const EXPENSE_BG = 'bg-orange-600';

export default function BillsDashboard({ stats, timeZone }: { stats: PublicBillsStats; timeZone: string }) {
  const [year, setYear] = useState<number>(stats.defaultYear ?? stats.years[0].year);
  const current: PublicYear = stats.years.find((y) => y.year === year) ?? stats.years[0];

  return (
    <div className="relative z-10 flex flex-col gap-6">
      <PageHeader back icon={<Wallet size={30} />} title="账单" subtitle="以新加坡元（SGD）记账，这里只公开汇总统计，不显示每一笔明细。">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="选择年份">
          {stats.years.map((y) => (
            <FilterChip key={y.year} active={y.year === current.year} onClick={() => setYear(y.year)}>
              {y.year} 年
            </FilterChip>
          ))}
        </div>
      </PageHeader>

      <section aria-label={`${current.year} 年合计`} className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <StatCard label="年度收入" value={formatSGD(current.income)} icon={<TrendingUp size={16} />} swatch={INCOME_BG} />
        <StatCard label="年度支出" value={formatSGD(current.expense)} icon={<TrendingDown size={16} />} swatch={EXPENSE_BG} />
        <StatCard label="结余" value={formatSGD(current.balance)} icon={<PiggyBank size={16} />} hint={current.balance < 0 ? '入不敷出' : undefined} />
        <StatCard
          label="储蓄率"
          value={current.savingsRate === null ? '—' : formatPercent(current.savingsRate)}
          icon={<PiggyBank size={16} />}
          hint={current.savingsRate === null ? '这一年还没有收入' : '结余 ÷ 收入'}
        />
      </section>

      <MonthlyChart data={current} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CategoryBreakdown data={current} />
        <aside className="flex flex-col gap-6">
          {stats.budget > 0 && <BudgetCard budget={stats.budget} monthExpense={stats.monthExpense} timeZone={timeZone} />}
          <section className="glass-card p-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:p-6">
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white">
              <CalendarClock size={18} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
              关于这些数字
            </h2>
            {stats.lastUpdated && <p className="mt-2">最近更新于 {dateLabel(stats.lastUpdated)}</p>}
            <p className="mt-2 text-slate-500 dark:text-slate-400">货币为新加坡元（S$）。只公开按月、按分类汇总后的金额，单笔记录和备注不公开。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** 手机上两列紧凑排（字小一号、内边距小），sm 起和原来一样 */
function StatCard({ label, value, icon, swatch, hint }: { label: string; value: string; icon: React.ReactNode; swatch?: string; hint?: string }) {
  return (
    <div className="glass-card flex min-w-0 flex-col gap-1 rounded-2xl px-3.5 py-3 sm:gap-1.5 sm:rounded-3xl sm:p-5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 sm:gap-2 sm:text-sm">
        {swatch ? <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`} aria-hidden="true" /> : <span className="text-indigo-500 dark:text-indigo-400" aria-hidden="true">{icon}</span>}
        {label}
      </span>
      <span className="truncate text-lg font-black tabular-nums tracking-tight text-slate-900 dark:text-white sm:text-2xl">{value}</span>
      {hint && <span className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}
    </div>
  );
}

// —— 每月收支柱状图（手写 SVG） ——

const PLOT_H = 220;
const HEAD = 10;

/** 刻度步长取 1 / 2 / 2.5 / 5 × 10ⁿ，四格 */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 100, ticks: [0, 25, 50, 75, 100] };
  const rough = max / 4;
  const exp = 10 ** Math.floor(Math.log10(rough));
  const f = rough / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => step * i) };
}

function Bar({ x, width, value, top, className }: { x: number; width: number; value: number; top: number; className: string }) {
  if (value <= 0) return null;
  const h = Math.max(2, ((PLOT_H - HEAD) * value) / top);
  const y = PLOT_H - h;
  // 顶端圆角、底端贴着基线是直角：圆角矩形上再叠一条直角的底
  return (
    <>
      <rect x={`${x}%`} y={y} width={`${width}%`} height={h} rx={3} className={className} />
      <rect x={`${x}%`} y={PLOT_H - Math.min(h, 3)} width={`${width}%`} height={Math.min(h, 3)} className={className} />
    </>
  );
}

function MonthlyChart({ data }: { data: PublicYear }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.months.map((m) => Math.max(m.income, m.expense)));
  const { top, ticks } = niceScale(max);
  const colW = 100 / 12;
  const barW = colW * 0.3;
  const y = (v: number) => PLOT_H - ((PLOT_H - HEAD) * v) / top;
  const shown = active === null ? null : data.months[active];

  return (
    <section className="glass-card p-5 sm:p-6" aria-labelledby="bills-monthly-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bills-monthly-title" className="text-lg font-black text-slate-900 dark:text-white">
          {data.year} 年每月收支
        </h2>
        <div className="flex items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${INCOME_BG}`} aria-hidden="true" />收入</span>
          <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${EXPENSE_BG}`} aria-hidden="true" />支出</span>
        </div>
      </div>

      <p className="mt-3 min-h-[1.5rem] text-xs tabular-nums text-slate-600 dark:text-slate-300 sm:text-sm" aria-live="polite">
        {shown ? (
          <>
            <b className="text-slate-900 dark:text-white">{shown.month} 月</b>　收入 {formatSGD(shown.income)} · 支出 {formatSGD(shown.expense)} · 结余 {formatSGD(shown.income - shown.expense)}
          </>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">把鼠标移到柱子上（或按 Tab 键、点一下）查看当月数值</span>
        )}
      </p>

      <div className="mt-2 flex gap-2">
        {/* 纵轴刻度 */}
        <div className="relative w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-500 dark:text-slate-400 sm:text-[11px]" style={{ height: PLOT_H }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
              {formatSGDCompact(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg width="100%" height={PLOT_H} role="group" aria-label={`${data.year} 年每月收入与支出柱状图`} className="block overflow-visible" onMouseLeave={() => setActive(null)}>
            {ticks.map((t) => (
              <line key={t} x1="0" x2="100%" y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-slate-400/70 dark:stroke-slate-500' : 'stroke-slate-300/60 dark:stroke-white/10'} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 4'} />
            ))}
            {data.months.map((m, i) => {
              const label = `${m.month}月：收入 ${formatSGD(m.income)}，支出 ${formatSGD(m.expense)}`;
              const x0 = i * colW;
              return (
                <g
                  key={m.month}
                  tabIndex={0}
                  role="img"
                  aria-label={label}
                  className="cursor-default outline-none"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  onClick={() => setActive(i)}
                >
                  <title>{label}</title>
                  {/* 整列都是感应区，比柱子本身大 */}
                  <rect x={`${x0}%`} y={0} width={`${colW}%`} height={PLOT_H} rx={6} className={active === i ? 'fill-slate-500/10 dark:fill-white/5' : 'fill-transparent'} />
                  <Bar x={x0 + colW * 0.18} width={barW} value={m.income} top={top} className={INCOME_FILL} />
                  <Bar x={x0 + colW * 0.18 + barW + colW * 0.04} width={barW} value={m.expense} top={top} className={EXPENSE_FILL} />
                </g>
              );
            })}
          </svg>
          <div className="mt-2 grid grid-cols-12 text-center text-[10px] text-slate-500 dark:text-slate-400 sm:text-xs" aria-hidden="true">
            {data.months.map((m) => (
              <span key={m.month} className={active === m.month - 1 ? 'font-bold text-slate-900 dark:text-white' : ''}>
                {m.month}
                <span className="hidden sm:inline">月</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer select-none text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-300">查看数据表</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-xs tabular-nums text-slate-700 dark:text-slate-300 sm:text-sm">
            <caption className="sr-only">{data.year} 年每月收支（新加坡元）</caption>
            <thead>
              <tr className="border-b border-slate-300/60 text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th scope="col" className="py-1.5 pr-3 font-bold">月份</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-bold">收入</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-bold">支出</th>
                <th scope="col" className="py-1.5 text-right font-bold">结余</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month} className="border-b border-slate-200/60 last:border-0 dark:border-white/5">
                  <th scope="row" className="py-1.5 pr-3 font-normal">{m.month} 月</th>
                  <td className="py-1.5 pr-3 text-right">{formatSGD(m.income)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatSGD(m.expense)}</td>
                  <td className="py-1.5 text-right">{formatSGD(m.income - m.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// —— 支出分类 ——

function CategoryBreakdown({ data }: { data: PublicYear }) {
  return (
    <section className="glass-card p-5 sm:p-6 lg:col-span-2" aria-labelledby="bills-category-title">
      <h2 id="bills-category-title" className="text-lg font-black text-slate-900 dark:text-white">
        {data.year} 年支出分类
      </h2>
      {data.expenseByCategory.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">这一年还没有支出。</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3.5">
          {data.expenseByCategory.map((c) => (
            <li key={c.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-bold text-slate-800 dark:text-slate-100">{c.name}</span>
                <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                  {formatSGD(c.amount)}
                  <span className="ml-2 inline-block w-12 text-right font-bold text-slate-900 dark:text-white">{formatPercent(c.share)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10" aria-hidden="true">
                <div className={`h-full rounded-full ${EXPENSE_BG}`} style={{ width: `${Math.max(c.share * 100, 0.8)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// —— 本月预算（「本月」按站点时区，在浏览器里算，页面是构建时生成的） ——

function BudgetCard({ budget, monthExpense, timeZone }: { budget: number; monthExpense: Record<string, number>; timeZone: string }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  const month = currentMonthIn(timeZone);
  const spent = monthExpense[month] ?? 0;
  const ratio = spent / budget;
  const over = spent > budget;
  const bar = over ? 'bg-rose-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <section className="glass-card p-5 sm:p-6" aria-labelledby="bills-budget-title">
      <h2 id="bills-budget-title" className="text-base font-black text-slate-900 dark:text-white">
        本月预算 <span className="ml-1 text-xs font-bold text-slate-500 dark:text-slate-400">{monthLabel(month)}</span>
      </h2>
      <p className="mt-3 text-sm tabular-nums text-slate-600 dark:text-slate-300">
        已用 <b className="text-slate-900 dark:text-white">{formatSGD(spent)}</b> / {formatSGD(budget)}
      </p>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10"
        role="progressbar"
        aria-label="本月预算已用"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
        aria-valuetext={formatPercent(ratio, 0)}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
        {over ? `超支 ${formatSGD(spent - budget)}` : `还剩 ${formatSGD(budget - spent)}（${formatPercent(1 - ratio, 0)}）`}
      </p>
    </section>
  );
}
