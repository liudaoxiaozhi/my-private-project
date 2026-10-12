// e2e/bills.spec.ts —— 账单：统计函数与 CSV、公开 /bills 页（只有汇总、不漏备注）、后台记一笔 / 分类保护 / 金额校验
//
// 测试数据是 e2e/fixtures/data/bills.json（scripts/e2e.mjs 构建前临时换进 data/，后台的 .e2e-admin-root 也从它开始）：
// 2026 年 9、10 月 12 笔 + 2025 年 1 笔；其中一笔的备注是「机密备注-E2E」，公开页里绝不能出现。
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { adminLogin, expect, test } from './support';
import { ADMIN_PASSWORD, ADMIN_ROOT } from './adminEnv';
import { buildPublicStats, coerceBills, formatSGD, parseAmount, round2, summarizeYear, todayIn } from '../lib/bills';
import type { BillsData } from '../lib/bills';
import { billsToCsv, importCsv } from '../lib/billsCsv';

const SECRET = '机密备注-E2E';
const fixture = (): BillsData => coerceBills(JSON.parse(fs.readFileSync(path.resolve('e2e/fixtures/data/bills.json'), 'utf8')));
const savedBills = (): BillsData => JSON.parse(fs.readFileSync(path.join(ADMIN_ROOT, 'data', 'bills.json'), 'utf8')) as BillsData;
const unique = () => Date.now().toString(36);

const section = (page: Page, name: string) => page.getByRole('navigation', { name: '后台板块' }).getByRole('button', { name, exact: true }).click();
const toast = (page: Page, text: RegExp | string) => expect(page.locator('p[role="status"], p[role="alert"]').filter({ hasText: text }).last()).toBeVisible();

/** 在后台页面里直接调接口（带 X-Admin 头、同源），返回状态码和报错 */
const putBills = (page: Page, bills: unknown) =>
  page.evaluate(async (body) => {
    const res = await fetch('/api/admin/bills', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin': '1' }, body: JSON.stringify({ bills: body }) });
    return { status: res.status, error: ((await res.json()) as { error?: string }).error ?? '' };
  }, bills);

test.describe('账单：统计与 CSV', () => {
  test('金额四舍五入、格式；年度汇总；公开统计里没有单笔明细；CSV 往返', () => {
    expect(round2(12.345)).toBe(12.35);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(parseAmount('S$1,234.5')).toBe(1234.5);
    expect(parseAmount('12.345')).toBe(12.35);
    expect(parseAmount('abc')).toBeNull();
    expect(formatSGD(1234.5)).toBe('S$1,234.50');
    expect(formatSGD(-3)).toBe('-S$3.00');

    const data = fixture();
    const y = summarizeYear(data, 2026);
    expect([y.income, y.expense, y.balance, y.count]).toEqual([6250, 2750.05, 3499.95, 12]);
    expect(y.savingsRate).toBeCloseTo(0.559992, 6);
    expect(y.months[8]).toEqual({ month: 9, income: 3250, expense: 1347.7 });
    expect(y.expenseByCategory[0]).toMatchObject({ id: 'housing', name: '住房', amount: 2400 });
    expect(y.expenseByCategory.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 9);

    const stats = buildPublicStats(data, 'Asia/Singapore', new Date('2026-10-12T04:00:00Z'));
    expect(stats.years.map((s) => s.year)).toEqual([2026, 2025]);
    expect(stats.defaultYear).toBe(2026);
    expect(stats.lastUpdated).toBe('2026-10-09');
    expect(stats.monthExpense['2026-10']).toBe(1402.35);
    const json = JSON.stringify(stats);
    for (const e of data.entries) if (e.note) expect(json).not.toContain(e.note);
    expect(json).not.toContain('"id"');

    const csv = billsToCsv(data, data.entries);
    expect(csv.startsWith('﻿日期,类型,分类,金额,备注\r\n')).toBe(true);
    expect(importCsv(csv, data)).toMatchObject({ entries: [], duplicates: 13, invalid: [] });
    const fresh = importCsv(csv, { ...data, entries: [] });
    expect(fresh.entries).toHaveLength(13);
    expect(fresh.entries.find((e) => e.note === SECRET)).toMatchObject({ date: '2026-09-15', type: 'expense', amount: 89.9, category: 'shopping' });

    const messy = importCsv('日期,类型,分类,金额,备注\n2026/9/1,支出,餐饮,"S$1,000.5","晚饭, 和朋友"\n2026-02-30,支出,餐饮,5,\n2026-09-02,支出,不存在,5,\n2026-09-03,收入,工资,-5,\n2026-09-04,其他,餐饮,5,\n', data);
    expect(messy.entries).toHaveLength(1);
    expect(messy.entries[0]).toMatchObject({ date: '2026-09-01', amount: 1000.5, category: 'food', note: '晚饭, 和朋友' });
    expect(messy.invalid.map((x) => x.line)).toEqual([3, 4, 5, 6]);
  });
});

test.describe('账单：公开页', () => {
  test('显示年度合计，可以切年份；页面里没有单笔备注', async ({ page, request }) => {
    const html = await (await request.get('/bills')).text();
    expect(html).toContain('S$6,250.00');
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain('十月房租');

    await page.goto('/bills');
    await expect(page.getByRole('heading', { name: '账单', level: 1 })).toBeVisible();
    const totals = page.getByRole('region', { name: '2026 年合计' });
    await expect(totals).toContainText('S$6,250.00');
    await expect(totals).toContainText('S$2,750.05');
    await expect(totals).toContainText('S$3,499.95');
    await expect(totals).toContainText('56.0%');
    await expect(page.getByRole('img', { name: '9月：收入 S$3,250.00，支出 S$1,347.70' })).toBeAttached();
    await expect(page.getByText('最近更新于 2026年10月9日')).toBeVisible();
    expect(await page.content()).not.toContain(SECRET);

    await page.getByRole('button', { name: '2025 年' }).click();
    const totals2025 = page.getByRole('region', { name: '2025 年合计' });
    await expect(totals2025).toContainText('S$30.00');
    await expect(totals2025).toContainText('—');
    await expect(page.getByRole('heading', { name: '2025 年支出分类' })).toBeVisible();
  });
});

test.describe('账单：后台', () => {
  test('记一笔：金额不合法时拒绝；合法的保存后写进 data/bills.json（金额保留两位）', async ({ page }) => {
    const note = `e2e 午饭 ${unique()}`;
    await adminLogin(page, ADMIN_PASSWORD);
    await section(page, '账单');
    const form = page.getByRole('form', { name: '记一笔' });
    await expect(form.getByLabel('分类')).toHaveValue('food');

    await form.getByLabel('金额').fill('-5');
    await form.getByRole('button', { name: '添加' }).click();
    await toast(page, /金额要填大于 0/);
    await form.getByLabel('金额').fill('abc');
    await form.getByLabel('金额').press('Enter');
    await expect(page.getByText(/^未保存：/)).toHaveCount(0);

    await form.getByLabel('金额').fill('12.345');
    await form.getByLabel('备注').fill(note);
    await form.getByLabel('备注').press('Enter');
    const list = page.getByRole('list', { name: /的记账$/ });
    await expect(list.getByRole('textbox', { name: '备注' }).first()).toHaveValue(note);
    await expect(list.getByRole('textbox', { name: '金额' }).first()).toHaveValue('12.35');
    await expect(page.getByText('未保存：新增 1 笔')).toBeVisible();

    await page.getByRole('button', { name: '保存', exact: true }).click();
    await toast(page, /账单已保存/);
    const entry = savedBills().entries.find((e) => e.note === note);
    expect(entry).toMatchObject({ type: 'expense', amount: 12.35, category: 'food', date: todayIn('Asia/Singapore') });
    expect(savedBills().entries.find((e) => e.note === SECRET)).toBeTruthy();
  });

  test('还在用的分类不能删；接口拒绝不合法的金额、日期和被删掉的在用分类', async ({ page }) => {
    await adminLogin(page, ADMIN_PASSWORD);
    await section(page, '账单');
    await page.getByRole('tab', { name: '分类与预算' }).click();
    await page.getByRole('group', { name: '分类 餐饮' }).getByRole('button', { name: '删除' }).click();
    await toast(page, /「餐饮」还有 \d+ 笔记账在用，不能删除/);
    await expect(page.getByRole('group', { name: '分类 餐饮' })).toBeVisible();
    // 没人用的分类可以删（点两下确认）
    const medical = page.getByRole('group', { name: '分类 医疗' });
    await medical.getByRole('button', { name: '删除' }).click();
    await medical.getByRole('button', { name: '确定？' }).click();
    await expect(page.getByRole('group', { name: '分类 医疗' })).toHaveCount(0);
    await expect(page.getByText(/分类 \/ 预算有改动/)).toBeVisible();

    const before = fs.readFileSync(path.join(ADMIN_ROOT, 'data', 'bills.json'), 'utf8');
    const base = savedBills();
    const first = base.entries[0];
    const withEntry = (patch: Record<string, unknown>) => ({ ...base, entries: [{ ...first, ...patch }, ...base.entries.slice(1)] });

    let res = await putBills(page, withEntry({ amount: 0 }));
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/金额要大于 0/);
    res = await putBills(page, withEntry({ amount: 'abc' }));
    expect(res.status).toBe(400);
    res = await putBills(page, withEntry({ amount: 2e7 }));
    expect(res).toMatchObject({ status: 400, error: expect.stringMatching(/金额太大/) });
    res = await putBills(page, withEntry({ date: '2026-02-30' }));
    expect(res).toMatchObject({ status: 400, error: expect.stringMatching(/日期/) });
    res = await putBills(page, withEntry({ type: 'income' }));
    expect(res).toMatchObject({ status: 400, error: expect.stringMatching(/收入分类|支出分类/) });
    res = await putBills(page, { ...base, categories: base.categories.filter((c) => c.id !== 'food') });
    expect(res).toMatchObject({ status: 400, error: expect.stringMatching(/「餐饮」还有 \d+ 笔记账在用/) });
    res = await putBills(page, { ...base, categories: [...base.categories, { id: 'dup', name: '餐饮', type: 'expense' }] });
    expect(res).toMatchObject({ status: 400, error: expect.stringMatching(/重复/) });
    // 被拒绝的保存不会动文件
    expect(fs.readFileSync(path.join(ADMIN_ROOT, 'data', 'bills.json'), 'utf8')).toBe(before);
  });
});
