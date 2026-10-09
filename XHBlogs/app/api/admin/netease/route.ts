// app/api/admin/netease/route.ts —— 后台的网易云歌曲：GET 当前列表，POST 解析粘贴的歌曲 / 歌单 ID（不保存），PUT 保存整份列表
import { adminRoute, AdminInputError, json, readJson } from '../../../../lib/server/admin/api';
import { getStorage } from '../../../../lib/server/admin/storage';
import { MAX_SONGS, NeteaseError, parseNeteaseInput, playlistSongs, songDetails } from '../../../../lib/server/netease';
import type { NeteaseSong } from '../../../../lib/server/netease';
import type { NeteaseTrack } from '../../../../lib/music';

const FILE = 'data/netease.json';

async function readList(): Promise<NeteaseTrack[]> {
  try {
    const parsed = JSON.parse((await getStorage().readText(FILE)) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as NeteaseTrack[]) : [];
  } catch {
    return [];
  }
}

export const GET = adminRoute(async () => json({ items: await readList() }));

/** 解析：{ input: 粘贴的内容, kind: 纯数字当作 song 还是 playlist } → 查到的歌曲 */
export const POST = adminRoute(async (req: Request) => {
  const { input, kind } = await readJson<{ input?: unknown; kind?: unknown }>(req);
  const parsed = parseNeteaseInput(String(input ?? ''), kind === 'playlist' ? 'playlist' : 'song');
  if (!parsed.songs.length && !parsed.playlists.length) throw new AdminInputError('没认出歌曲或歌单 ID：粘贴链接，或者填数字 ID');
  try {
    const songs: NeteaseSong[] = parsed.songs.length ? await songDetails(parsed.songs) : [];
    const playlists: { id: number; name: string; count: number }[] = [];
    for (const id of parsed.playlists) {
      const result = await playlistSongs(id);
      playlists.push({ id, name: result.name, count: result.songs.length });
      songs.push(...result.songs);
    }
    const unique = [...new Map(songs.map((s) => [s.id, s])).values()].slice(0, MAX_SONGS);
    return json({ songs: unique, playlists, missing: parsed.songs.filter((id) => !unique.some((s) => s.id === id)) });
  } catch (error) {
    if (error instanceof NeteaseError) throw new AdminInputError(error.message);
    throw error;
  }
});

export const PUT = adminRoute(async (req: Request) => {
  const { items } = await readJson<{ items?: unknown }>(req);
  if (!Array.isArray(items) || items.length > MAX_SONGS * 2) throw new AdminInputError('列表格式不对');
  const seen = new Set<number>();
  const clean: NeteaseTrack[] = items.map((raw, i) => {
    const t = (raw ?? {}) as Partial<NeteaseTrack>;
    if (typeof t.id !== 'number' || !Number.isInteger(t.id) || t.id <= 0) throw new AdminInputError(`第 ${i + 1} 首的 ID 不对`);
    if (seen.has(t.id)) throw new AdminInputError(`ID ${t.id} 重复了`);
    seen.add(t.id);
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    return { id: t.id, title: text(t.title, 200) || String(t.id), artist: text(t.artist, 200), cover: /^https:\/\//.test(text(t.cover, 500)) ? text(t.cover, 500) : '', fee: typeof t.fee === 'number' ? t.fee : 0 };
  });
  const { sha } = await getStorage().commit([{ path: FILE, content: `${JSON.stringify(clean, null, 2)}\n` }], `后台：更新网易云歌单（${clean.length} 首）`);
  return json({ ok: true, sha, items: clean });
});
