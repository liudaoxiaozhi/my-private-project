// app/api/admin/music/lyrics/route.ts —— 读取一首歌的歌词（编辑用）
import { adminRoute, fail, json } from '../../../../../lib/server/admin/api';
import { readLyrics } from '../../../../../lib/server/admin/music';

export const GET = adminRoute(async (req: Request) => {
  const file = new URL(req.url).searchParams.get('file');
  if (!file) return fail('缺少 file', 400);
  return json({ lyrics: await readLyrics(file) });
});
