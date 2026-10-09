"use client";
// components/admin/MusicSection.tsx —— 歌曲管理：上传 mp3（可带封面、歌词）、排序、置顶、改名、删除
//
// 两部分：网易云（粘贴歌曲 / 歌单链接或 ID 导入，存 data/netease.json）在前，本地上传的 mp3 接在后面。
// 整个歌单的第一首就是打开网站时默认放的那首。本地歌曲的顺序靠文件名前的序号，调整顺序 = 后台帮你重新编号改名。
import { useEffect, useRef, useState } from 'react';
import { api, compressImage, stage } from '../../lib/admin/client';
import type { SaveResult } from '../../lib/admin/client';
import { Button, ConfirmButton, Empty, Field, Grid, Loading, Panel, Row, SaveBar, Select, TextArea, TextInput, Toggle, useAdmin, useLoader } from './ui';
import type { NeteaseTrack } from '../../lib/music';

interface Song {
  file: string;
  title: string;
  artist: string;
  cover: string | null;
  lyrics: string | null;
  size: number;
}

const AUDIO_ACCEPT = '.mp3,.m4a,.aac,.ogg,.opus,.flac,.wav,audio/*';
const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** 「01. 歌手 - 歌名.mp3」→ 歌手、歌名 */
function guessFromName(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/^\d{1,3}[._)]\s*/, '').trim();
  const i = base.indexOf(' - ');
  return i === -1 ? { title: base, artist: '' } : { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() };
}

async function stageCover(file: File): Promise<{ staged: string; ext: string }> {
  const { blob, ext } = await compressImage(file);
  return { staged: await stage(blob), ext };
}

export default function MusicSection() {
  const [neteaseCount, setNeteaseCount] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <NeteasePanel onCount={setNeteaseCount} />
      <LocalSongs firstOverall={neteaseCount === 0} />
    </div>
  );
}

const isPaid = (fee: number) => fee === 1 || fee === 4;

/** 网易云歌曲：粘贴链接 / ID → 解析 → 加入列表 → 排序 → 保存 */
function NeteasePanel({ onCount }: { onCount: (n: number) => void }) {
  const [original, setOriginal] = useState<NeteaseTrack[] | null>(null);
  const [items, setItems] = useState<NeteaseTrack[]>([]);
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<'song' | 'playlist'>('song');
  const [first, setFirst] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, saved } = useAdmin();

  useLoader<{ items: NeteaseTrack[] }>(
    '/api/admin/netease',
    (d) => {
      setOriginal(d.items);
      setItems(d.items);
      onCount(d.items.length);
    },
    () => setOriginal([]),
  );

  if (original === null) return <Panel title="网易云歌曲"><Loading /></Panel>;

  const resolve = async () => {
    setResolving(true);
    try {
      const res = await api<{ songs: NeteaseTrack[]; playlists: { id: number; name: string; count: number }[]; missing: number[] }>('/api/admin/netease', {
        method: 'POST',
        body: { input, kind },
      });
      const fresh = res.songs.filter((s) => !items.some((t) => t.id === s.id));
      setItems((list) => (first ? [...fresh, ...list] : [...list, ...fresh]));
      const from = res.playlists.map((p) => `歌单「${p.name || p.id}」${p.count} 首`).join('、');
      toast(
        `${from ? `${from}，` : ''}加入 ${fresh.length} 首${res.songs.length > fresh.length ? `（${res.songs.length - fresh.length} 首已经在列表里）` : ''}${res.missing.length ? `；找不到 ${res.missing.join('、')}` : ''}。记得点保存`,
        fresh.length ? 'ok' : 'info',
      );
      if (fresh.length) setInput('');
    } catch (e) {
      toast(e instanceof Error ? e.message : '解析失败', 'error');
    } finally {
      setResolving(false);
    }
  };

  const move = (i: number, d: number) =>
    setItems((list) => {
      const next = [...list];
      const [it] = next.splice(i, 1);
      next.splice(i + d, 0, it);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const res = await api<SaveResult & { items: NeteaseTrack[] }>('/api/admin/netease', { method: 'PUT', body: { items } });
      setOriginal(res.items);
      setItems(res.items);
      onCount(res.items.length);
      saved(res, '网易云歌单已保存');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(items) !== JSON.stringify(original);
  const paid = items.filter((t) => isPaid(t.fee)).length;

  return (
    <Panel
      title="网易云歌曲"
      subtitle={`共 ${items.length} 首 · 排在本地歌曲前面，第一首就是打开网页时默认播放的那首${paid ? ` · ${paid} 首是 VIP / 付费歌曲，外链多半放不了，会自动跳过` : ''}`}
    >
      <div className="admin-row flex flex-col gap-3 p-4 sm:p-5">
        <TextArea
          value={input}
          onChange={setInput}
          rows={2}
          placeholder={'粘贴歌曲或歌单链接（music.163.com/#/song?id=… 或 /playlist?id=…），也可以直接填数字 ID，多个用逗号或换行隔开'}
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="admin-hint text-xs">纯数字当作</span>
          <div className="w-32">
            <Select value={kind} onChange={setKind} options={[{ value: 'song', label: '歌曲 ID' }, { value: 'playlist', label: '歌单 ID' }]} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} className="accent-indigo-500" />
            加到最前面
          </label>
          <Button tone="primary" size="md" className="ml-auto" disabled={resolving || !input.trim()} onClick={() => void resolve()}>
            {resolving ? '解析中…' : '解析并加入'}
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {items.length === 0 && <Empty>还没有网易云歌曲，上面粘贴一个歌单链接试试</Empty>}
        {items.map((t, i) => (
          <Row key={t.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.cover ? <img src={t.cover} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" /> : null}
            <div className="min-w-[12rem] flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-bold text-white">
                {t.title}
                {i === 0 && <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">首播</span>}
                {isPaid(t.fee) && <span className="rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">VIP</span>}
              </p>
              <p className="admin-hint mt-0.5 truncate font-lab text-[11px]">
                {t.artist || '未知歌手'} · ID {t.id}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button tone="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移">↑</Button>
              <Button tone="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="下移">↓</Button>
              {i > 0 && <Button tone="amber" onClick={() => setItems((list) => [t, ...list.filter((x) => x !== t)])}>置顶</Button>}
              <Button tone="rose" onClick={() => setItems((list) => list.filter((x) => x !== t))}>移除</Button>
            </div>
          </Row>
        ))}
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={() => setItems(original)} note="有未保存的修改（加入、排序、移除都要点保存）" />
    </Panel>
  );
}

/** 本地上传的歌曲（public/music/） */
function LocalSongs({ firstOverall }: { firstOverall: boolean }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const { toast, saved } = useAdmin();

  const load = useLoader<{ items: Song[] }>('/api/admin/music', (d) => setSongs(d.items), () => setSongs([]));

  const run = async (action: () => Promise<SaveResult>, done: string) => {
    setBusy(true);
    try {
      saved(await action(), done);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reorder = (order: string[]) => run(() => api<SaveResult>('/api/admin/music', { method: 'PUT', body: { order } }), '顺序已调整');
  const move = (i: number, d: number) => {
    if (!songs) return;
    const order = songs.map((s) => s.file);
    const [f] = order.splice(i, 1);
    order.splice(i + d, 0, f);
    void reorder(order);
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel title="本地上传的歌曲" subtitle={songs ? `共 ${songs.length} 首 · 排在网易云歌曲后面 · 保存后网站约 1~2 分钟更新` : undefined}>
        <AddSong disabled={busy} onAdded={(res) => { saved(res, '已添加'); load(); }} />
        <div className="mt-5 flex flex-col gap-3">
          {songs === null ? (
            <Loading />
          ) : songs.length === 0 ? (
            <Empty>还没有歌，上面上传第一首吧</Empty>
          ) : (
            songs.map((song, i) => (
              <div key={song.file}>
                <Row>
                  <div className="min-w-[12rem] flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-bold text-white">
                      {song.title}
                      {i === 0 && firstOverall && <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">首播</span>}
                    </p>
                    <p className="admin-hint mt-0.5 truncate font-lab text-[11px]">
                      {song.artist || '未知歌手'} · {mb(song.size)}
                      {song.cover ? ' · 有封面' : ''}
                      {song.lyrics ? ' · 有歌词' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button tone="ghost" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="上移">↑</Button>
                    <Button tone="ghost" disabled={busy || i === songs.length - 1} onClick={() => move(i, 1)} aria-label="下移">↓</Button>
                    {i > 0 && (
                      <Button tone="amber" disabled={busy} onClick={() => void reorder([song.file, ...songs.filter((s) => s !== song).map((s) => s.file)])}>
                        置顶
                      </Button>
                    )}
                    <Button tone="indigo" disabled={busy} onClick={() => setEditing(editing === song.file ? null : song.file)}>
                      {editing === song.file ? '收起' : '编辑'}
                    </Button>
                    <ConfirmButton disabled={busy} onConfirm={() => void run(() => api<SaveResult>(`/api/admin/music?file=${encodeURIComponent(song.file)}`, { method: 'DELETE' }), '已删除')}>
                      删除
                    </ConfirmButton>
                  </div>
                </Row>
                {editing === song.file && (
                  <EditSong
                    song={song}
                    onDone={(res) => {
                      setEditing(null);
                      if (res) {
                        saved(res, '已保存');
                        load();
                      }
                    }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function AddSong({ disabled, onAdded }: { disabled: boolean; onAdded: (res: SaveResult) => void }) {
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [first, setFirst] = useState(false);
  const [progress, setProgress] = useState('');
  const audioInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const lrcInput = useRef<HTMLInputElement>(null);
  const { toast } = useAdmin();

  const reset = () => {
    setAudio(null);
    setCover(null);
    setTitle('');
    setArtist('');
    setLyrics('');
    setFirst(false);
  };

  const submit = async () => {
    if (!audio) return toast('先选一个音频文件', 'error');
    if (!title.trim()) return toast('请填写歌名', 'error');
    try {
      setProgress(`上传音频（${mb(audio.size)}）…`);
      const audioStaged = await stage(audio);
      let coverStaged: { staged: string; ext: string } | undefined;
      if (cover) {
        setProgress('上传封面…');
        coverStaged = await stageCover(cover);
      }
      setProgress('保存中…');
      const res = await api<SaveResult>('/api/admin/music', {
        method: 'POST',
        body: { title, artist, audio: { staged: audioStaged, ext: extOf(audio.name) }, cover: coverStaged, lyrics, first },
      });
      reset();
      onAdded(res);
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败', 'error');
    } finally {
      setProgress('');
    }
  };

  return (
    <div className="admin-row flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button tone="indigo" size="md" disabled={disabled || !!progress} onClick={() => audioInput.current?.click()}>
          {audio ? '换一个音频' : '选择音频文件'}
        </Button>
        <span className="admin-hint min-w-0 flex-1 truncate text-xs">
          {audio ? `${audio.name}（${mb(audio.size)}）` : '支持 mp3 / m4a / flac 等；单首建议 20MB 以内。文件里自带的封面、歌词会自动读出来'}
        </span>
      </div>
      {audio && (
        <>
          <Grid>
            <Field label="歌名"><TextInput value={title} onChange={setTitle} /></Field>
            <Field label="歌手"><TextInput value={artist} onChange={setArtist} /></Field>
            <Field group label="封面（可不填）" hint="不填就用音频文件里自带的封面">
              <div className="flex items-center gap-2">
                <Button tone="ghost" onClick={() => coverInput.current?.click()}>{cover ? '换一张' : '选择图片'}</Button>
                <span className="admin-hint truncate text-xs">{cover?.name ?? ''}</span>
              </div>
            </Field>
            <Field group label="歌词（可不填，LRC 格式）" hint="可以粘贴，也可以选 .lrc 文件；不填就用音频里自带的">
              <div className="flex flex-col gap-2">
                <TextArea value={lyrics} onChange={setLyrics} rows={3} placeholder="[00:12.30]第一句歌词" />
                <Button tone="ghost" onClick={() => lrcInput.current?.click()}>选择 .lrc 文件</Button>
              </div>
            </Field>
          </Grid>
          <Toggle checked={first} onChange={setFirst} label="放到第一首" hint="打开网站时默认播放这首" />
          <div className="flex justify-end gap-2">
            <Button tone="ghost" size="md" onClick={reset} disabled={!!progress}>取消</Button>
            <Button tone="primary" size="md" onClick={() => void submit()} disabled={disabled || !!progress}>
              {progress || '添加'}
            </Button>
          </div>
        </>
      )}
      <input
        ref={audioInput}
        type="file"
        accept={AUDIO_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setAudio(f);
          const guess = guessFromName(f.name);
          setTitle(guess.title);
          setArtist(guess.artist);
        }}
      />
      <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { setCover(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      <input
        ref={lrcInput}
        type="file"
        accept=".lrc,.txt,text/plain"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setLyrics(await f.text());
        }}
      />
    </div>
  );
}

function EditSong({ song, onDone }: { song: Song; onDone: (res: SaveResult | null) => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [cover, setCover] = useState<File | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const { toast } = useAdmin();

  useEffect(() => {
    let alive = true;
    api<{ lyrics: string }>(`/api/admin/music/lyrics?file=${encodeURIComponent(song.file)}`)
      .then((r) => alive && setLyrics(r.lyrics))
      .catch(() => alive && setLyrics(''));
    return () => {
      alive = false;
    };
  }, [song.file]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { file: song.file, title, artist };
      if (cover !== undefined) body.cover = cover ? await stageCover(cover) : null;
      if (lyrics !== null) body.lyrics = lyrics.trim() ? lyrics : null;
      onDone(await api<SaveResult>('/api/admin/music', { method: 'PATCH', body }));
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-row mt-2 flex flex-col gap-4 p-4 sm:p-5">
      <Grid>
        <Field label="歌名" hint="改歌名 / 歌手会给文件改名"><TextInput value={title} onChange={setTitle} /></Field>
        <Field label="歌手"><TextInput value={artist} onChange={setArtist} /></Field>
        <Field group label="封面">
          <div className="flex flex-wrap items-center gap-2">
            <Button tone="ghost" onClick={() => coverInput.current?.click()}>{cover ? '换一张' : '上传新封面'}</Button>
            {song.cover && cover !== null && <Button tone="rose" onClick={() => setCover(null)}>删掉封面</Button>}
            <span className="admin-hint truncate text-xs">{cover ? cover.name : cover === null ? '将删除封面' : song.cover ? `现在：${song.cover}` : '没有单独的封面'}</span>
          </div>
        </Field>
        <Field label="歌词（LRC）" hint="清空就是删掉歌词文件（音频自带的歌词仍会显示）">
          {lyrics === null ? <p className="admin-hint text-xs">读取中…</p> : <TextArea value={lyrics} onChange={setLyrics} rows={4} />}
        </Field>
      </Grid>
      <div className="flex justify-end gap-2">
        <Button tone="ghost" size="md" onClick={() => onDone(null)} disabled={saving}>取消</Button>
        <Button tone="primary" size="md" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
      </div>
      <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { setCover(e.target.files?.[0] ?? undefined); e.target.value = ''; }} />
    </div>
  );
}
