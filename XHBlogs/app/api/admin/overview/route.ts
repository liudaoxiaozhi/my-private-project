// app/api/admin/overview/route.ts —— 后台「概览」：各类内容的数量、最近的提交、网站部署状态
import { adminRoute, json } from '../../../../lib/server/admin/api';
import { getStorage, storageInfo } from '../../../../lib/server/admin/storage';
import { listSongs } from '../../../../lib/server/admin/music';
import { readData } from '../../../../lib/server/admin/settings';

export const GET = adminRoute(async () => {
  const storage = getStorage();
  const countMd = async (dir: string) => (await storage.list(dir)).filter((f) => f.type === 'file' && f.name.endsWith('.md')).length;
  const [posts, chatters, moments, songs, albums, friends, projects, commits] = await Promise.all([
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
    storage.recentCommits(8).catch(() => []),
  ]);
  const photos = albums.reduce<number>((n, a) => n + (Array.isArray((a as { photos?: unknown[] }).photos) ? (a as { photos: unknown[] }).photos.length : 0), 0);
  const deploy = commits[0] ? await storage.deployStatus(commits[0].sha).catch(() => null) : null;
  return json({
    storage: storageInfo(),
    counts: { posts, chatters, moments, songs, albums: albums.length, photos, friends, projects },
    commits,
    deploy,
  });
});
