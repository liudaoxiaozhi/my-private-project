// app/bills/page.tsx —— 账单：年度结余、每月收支趋势、分类占比（只公开汇总统计）
//
// 数据在 data/bills.json，站长在网页后台「账单」里记。这一页是静态页面：构建时在服务端读文件、算好统计，
// 传给浏览器的只有汇总数字（buildPublicStats），单笔金额和备注不会出现在页面里。后台保存后网站重新部署就会更新。
import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import PageHeader from '../../components/PageHeader';
import { buildPublicStats } from '../../lib/bills';
import { readBills } from '../../lib/server/billsStore';
import { siteConfig } from '../../siteConfig';
import BillsDashboard from './BillsDashboard';

export const metadata: Metadata = { title: `账单 | ${siteConfig.title}`, description: '收支统计：年度结余、每月收支趋势和支出分类占比' };

export default function BillsPage() {
  const stats = buildPublicStats(readBills(), siteConfig.timeZone);
  const hasData = stats.years.length > 0;

  return (
    <div className="relative min-h-screen pb-24">
      <main className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
        {hasData ? (
          <BillsDashboard stats={stats} timeZone={siteConfig.timeZone} />
        ) : (
          <>
            <PageHeader back icon={<Wallet size={30} />} title="账单" subtitle="以新加坡元（SGD）记账，这里只公开汇总统计，不显示每一笔明细。" />
            <EmptyState
              className="mt-6"
              icon={<Wallet size={30} />}
              title="还没有记账"
              description="站长在后台（/admin）的「账单」里记账，记下第一笔后，这里会显示年度结余、每月收支和支出分类。"
            />
          </>
        )}
      </main>
    </div>
  );
}
