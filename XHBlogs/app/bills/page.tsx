// app/bills/page.tsx —— 账单（建设中：之后接入后台记账数据，只公开统计，不显示流水明细）
import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import ComingSoon from '../../components/ComingSoon';
import { siteConfig } from '../../siteConfig';

export const metadata: Metadata = { title: `账单 | ${siteConfig.title}`, description: '收支统计' };

export default function BillsPage() {
  return <ComingSoon title="账单" description="年度结余、每月收支趋势和分类占比，正在整理中。" Icon={Wallet} />;
}
