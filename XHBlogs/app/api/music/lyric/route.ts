// app/api/music/lyric/route.ts —— 网易云歌曲的歌词（LRC 文本）。浏览器不能直接跨域请求网易云，由这里代取
//
// 歌词基本不会变：CDN 缓存一天，过期后一周内先给旧的、后台再更新
import { lyric, NeteaseError } from '../../../../lib/server/netease';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^\d{1,12}$/.test(id)) return new Response('bad id', { status: 400 });
  try {
    return new Response(await lyric(Number(id)), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    // 拿不到歌词不影响播放，前端显示「纯享音乐」
    return new Response('', { status: error instanceof NeteaseError ? 502 : 500 });
  }
}
