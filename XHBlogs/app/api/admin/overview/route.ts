// app/api/admin/overview/route.ts —— 后台「概览」：各类内容的数量、最近的提交、网站部署（或自己服务器上的重建）状态
import { adminRoute, json } from '../../../../lib/server/admin/api';
import { getStorage, storageInfo } from '../../../../lib/server/admin/storage';
import { listSongs } from '../../../../lib/server/admin/music';
import { readData } from '../../../../lib/server/admin/settings';
import { readBillsLatest } from '../../../../lib/server/billsStore';

export const GET = adminRoute(async () => {
  const storage = getStorage();
  const countMd = async (dir: string) => (await storage.list(dir)).filter((f) => f.type === 'file' && f.name.endsWith('.md')).length;
  const [posts, chatters, moments, songs, albums, friends, projects, bills, commits] = await Promise.all([
    countMd('posts'),
    countMd('chatters'),
    countMd('moments'),
    Promise.all([listSongs(), storage.readText('data/netease.json')]).then(([local, netease]) => {
      try {
        const list = JSON.parse(netease ?? '[]') as unknown;
        return local.length + (Array.isArray(list) ? list.length : 0);
      } catch {
        return local.length;
      }
    }),
    readData('albums'),
    readData('friends').then((d) => d.length),
    readData('projects').then((d) => d.length),
    readBillsLatest().then((b) => b.bills.entries.length),
    storage.recentCommits(8).catch(() => []),
  ]);
  const photos = albums.reduce<number>((n, a) => n + (Array.isArray((a as { photos?: unknown[] }).photos) ? (a as { photos: unknown[] }).photos.length : 0), 0);
  // GitHub：最新一次提交的 Vercel 部署状态；自己的服务器（本地存储 + 自动重建）：最近一次重建的状态
  const info = storageInfo();
  const deploy = commits[0]
    ? await storage.deployStatus(commits[0].sha).catch(() => null)
    : info.rebuild
      ? await storage.deployStatus('').catch(() => null)
      : null;
  return json({
    storage: info,
    counts: { posts, chatters, moments, songs, albums: albums.length, photos, friends, projects, bills },
    commits,
    deploy,
  });
});
