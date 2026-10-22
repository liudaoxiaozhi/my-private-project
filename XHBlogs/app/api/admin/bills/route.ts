// app/api/admin/bills/route.ts —— 账单：GET 整份读（附文件状态）、PUT 整份写（校验后加密，一次提交）
import { AdminInputError, adminRoute, json, readJson } from '../../../../lib/server/admin/api';
import { hasDedicatedSecretsKey } from '../../../../lib/server/admin/secrets';
import { LOCKED_MESSAGE, readBillsLatest, validateBills, writeBills } from '../../../../lib/server/billsStore';

export const GET = adminRoute(async () => {
  const { bills, state } = await readBillsLatest();
  // state：locked 时后台显示红色提示并禁止保存；secretsKey：没单独设置钥匙时后台提醒
  return json({ bills, state, secretsKey: hasDedicatedSecretsKey() });
});

export const PUT = adminRoute(async (req: Request) => {
  const body = await readJson<{ bills?: unknown; overwriteLocked?: boolean }>(req);
  const latest = await readBillsLatest();
  // 解不开的旧文件：只有站长在后台明确确认「放弃旧账单」后才允许覆盖
  const force = body.overwriteLocked === true;
  if (latest.state === 'locked' && !force) throw new AdminInputError(LOCKED_MESSAGE);
  const bills = validateBills(body.bills, latest.state === 'locked' ? undefined : latest.bills);
  const { sha } = await writeBills(bills, { overwriteLocked: force });
  // 返回整理后的数据（金额保留两位、按日期排好），后台用它作为新的「已保存」版本
  return json({ ok: true, sha, bills });
});
