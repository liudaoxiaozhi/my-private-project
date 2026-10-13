// e2e/fake-netease.mjs —— 测试用的假网易云接口（测试环境连不上 music.163.com）
// playwright.config.ts 启动它，并把 NETEASE_API_BASE 指过来。数据结构照网易云真实接口的样子
import http from 'node:http';

const PORT = Number(process.env.FAKE_NETEASE_PORT || 3199);

// 新旧两种字段都有：/api/song/detail 用 artists / album，歌单里的 tracks 用 ar / al
const SONGS = {
  101: { id: 101, name: '晴天', artists: [{ name: '周杰伦' }], album: { picUrl: 'http://p1.music.126.net/a.jpg' }, fee: 8, duration: 269000 },
  102: { id: 102, name: '夜曲', artists: [{ name: '周杰伦' }], album: { picUrl: 'http://p1.music.126.net/b.jpg' }, fee: 1, duration: 226000 },
  103: { id: 103, name: '稻香', artists: [{ name: '周杰伦' }], album: { picUrl: 'http://p1.music.126.net/c.jpg' }, fee: 0, duration: 223000 },
};

const send = (res, body) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/song/detail/') {
      const ids = JSON.parse(url.searchParams.get('ids') || '[]');
      return send(res, { code: 200, songs: ids.map((id) => SONGS[id]).filter(Boolean) });
    }
    if (url.pathname === '/api/v6/playlist/detail') {
      if (url.searchParams.get('id') !== '900') return send(res, { code: 404, msg: 'not found' });
      const { id, name, fee } = SONGS[101];
      return send(res, {
        code: 200,
        playlist: { name: '测试歌单', trackIds: [{ id: 101 }, { id: 102 }, { id: 103 }], tracks: [{ id, name, ar: [{ name: '周杰伦' }], al: { picUrl: 'https://p1.music.126.net/a.jpg' }, fee, dt: 269000 }] },
      });
    }
    if (url.pathname === '/api/song/lyric/v1') {
      // 新接口：多一份逐字歌词（yrc）；102 模拟新接口出错，走旧接口
      if (url.searchParams.get('id') === '102') return send(res, { code: 500 });
      return send(res, {
        code: 200,
        lrc: { lyric: '[00:00.00]作词 : 测试\n[00:01.00]第一句\n[00:02.00]第二句' },
        tlyric: { lyric: '[00:01.00]first line' },
        yrc: { lyric: '{"t":0,"c":[{"tx":"作词: "},{"tx":"测试"}]}\n[1000,900](1000,400,0)第(1400,500,0)一句\n[2000,800](2000,800,0)第二句' },
      });
    }
    if (url.pathname === '/api/song/lyric') {
      return send(res, { code: 200, lrc: { lyric: '[00:01.00]第一句\n[00:02.00]第二句' }, tlyric: { lyric: '[00:01.00]first line' } });
    }
    res.writeHead(404);
    res.end();
  })
  .listen(PORT, () => console.log(`fake netease on ${PORT}`));
