// app/api/admin/bills/route.ts —— 账单：GET 整份读、PUT 整份写（校验后一次提交）
import { adminRoute, json, readJson } from '../../../../lib/server/admin/api';
import { readBillsLatest, validateBills, writeBills } from '../../../../lib/server/billsStore';

export const GET = adminRoute(async () => json({ bills: await readBillsLatest() }));

export const PUT = adminRoute(async (req: Request) => {
  const body = await readJson<{ bills?: unknown }>(req);
  const bills = validateBills(body.bills, await readBillsLatest());
  const { sha } = await writeBills(bills);
  // 返回整理后的数据（金额保留两位、按日期排好），后台用它作为新的「已保存」版本
  return json({ ok: true, sha, bills });
});
