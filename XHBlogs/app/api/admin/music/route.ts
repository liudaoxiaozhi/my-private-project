// app/api/admin/music/route.ts —— 歌曲：GET 列表、POST 添加、PUT 排序、PATCH 修改、DELETE 删除（?file=）
import { adminRoute, fail, json, readJson } from '../../../../lib/server/admin/api';
import { addSong, deleteSong, editSong, listSongs, reorderSongs } from '../../../../lib/server/admin/music';
import type { SongEdit, SongUpload } from '../../../../lib/server/admin/music';

export const GET = adminRoute(async () => json({ items: await listSongs() }));

export const POST = adminRoute(async (req: Request) => json({ ok: true, ...(await addSong(await readJson<SongUpload>(req))) }));

export const PUT = adminRoute(async (req: Request) => {
  const { order } = await readJson<{ order: unknown }>(req);
  return json({ ok: true, ...(await reorderSongs(order)) });
});

export const PATCH = adminRoute(async (req: Request) => json({ ok: true, ...(await editSong(await readJson<SongEdit>(req))) }));

export const DELETE = adminRoute(async (req: Request) => {
  const file = new URL(req.url).searchParams.get('file');
  if (!file) return fail('缺少 file', 400);
  return json({ ok: true, ...(await deleteSong(file)) });
});
