"use client";
// components/admin/AdminApp.tsx —— 网页后台（/admin）：登录、侧边栏、各个板块、保存后的部署进度
//
// 板块用网址里的 ?s= 记住（刷新、分享链接都停在同一个板块）。
// 「简洁」：去掉背景插画和毛玻璃，手机上更省电、更清楚（记在浏览器里）。
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../lib/admin/client';
import type { SaveResult } from '../../lib/admin/client';
import { siteConfig } from '../../siteConfig';
import ContentSection from './ContentSection';
import type { ContentKind } from './ContentSection';
import MusicSection from './MusicSection';
import { AppearanceSection, DanmakuSection, SettingsSection } from './ConfigSections';
import { AlbumsSection, FriendsSection, ProjectsSection } from './DataSections';
import { AdminContext, Button, Loading, Panel, Row, inputClass } from './ui';
import type { AdminContextValue } from './ui';

type SectionId = 'overview' | ContentKind | 'music' | 'danmaku' | 'appearance' | 'albums' | 'friends' | 'projects' | 'settings';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'posts', label: '文章' },
  { id: 'chatters', label: '杂谈' },
  { id: 'moments', label: '说说' },
  { id: 'music', label: '歌曲' },
  { id: 'danmaku', label: '弹幕' },
  { id: 'appearance', label: '外观' },
  { id: 'albums', label: '照片墙' },
  { id: 'friends', label: '友链' },
  { id: 'projects', label: '项目' },
  { id: 'about', label: '关于我' },
  { id: 'settings', label: '站点设置' },
];

interface StorageInfo {
  kind: 'github' | 'local' | 'none';
  target: string;
  problem?: string;
}

interface Session {
  configured: boolean;
  loggedIn: boolean;
  storage: StorageInfo | null;
}

interface Deploy {
  state: 'success' | 'pending' | 'failure' | 'error' | 'unknown';
  url: string | null;
  description: string;
}

const COMPACT_KEY = 'admin-compact';

function readSection(): SectionId {
  const s = new URLSearchParams(window.location.search).get('s');
  return SECTIONS.some((x) => x.id === s) ? (s as SectionId) : 'overview';
}

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    let alive = true;
    api<Session>('/api/admin/session')
      .then((s) => alive && setSession(s))
      .catch(() => alive && setSession({ configured: false, loggedIn: false, storage: null }));
    return () => {
      alive = false;
    };
  }, [version]);

  if (!session) return <Frame><Loading /></Frame>;
  if (!session.configured) {
    return (
      <Frame>
        <Panel title="后台还没启用" subtitle="需要先设置管理员密码">
          <p className="text-sm leading-relaxed text-slate-300">
            在 Vercel 项目的 Settings → Environment Variables 里添加 <code className="rounded bg-black/30 px-1.5">ADMIN_PASSWORD</code>（管理员密码），
            再加上 <code className="rounded bg-black/30 px-1.5">GITHUB_TOKEN</code> 和 <code className="rounded bg-black/30 px-1.5">GITHUB_REPO</code>，重新部署一次就能用了。
            详细步骤见仓库里的 <code className="rounded bg-black/30 px-1.5">XHBlogs/docs/ADMIN.md</code>。
          </p>
        </Panel>
      </Frame>
    );
  }
  if (!session.loggedIn) return <Login onDone={refresh} />;
  return <Console storage={session.storage ?? { kind: 'none', target: '' }} onLogout={refresh} />;
}

/** 外框：背景沿用网站的插画，上面盖一层暗色 */
function Frame({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`admin-root relative min-h-screen ${compact ? 'admin-compact' : ''}`}>
      <div className="admin-backdrop fixed inset-0 -z-[1] bg-slate-950/45" />
      <div className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/session', { method: 'POST', body: { password } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame>
      <form onSubmit={submit} className="admin-panel mx-auto mt-[12vh] flex max-w-sm flex-col gap-5 p-8">
        <div>
          <p className="text-2xl font-black text-white">XHBlogs</p>
          <p className="font-lab text-[11px] tracking-[0.3em] text-indigo-300">CONTROL PANEL</p>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理员密码"
          aria-label="管理员密码"
          className={inputClass}
        />
        {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
        <Button type="submit" tone="primary" size="md" disabled={busy || !password}>
          {busy ? '登录中…' : '登录'}
        </Button>
        <Link href="/" className="text-center text-xs text-slate-400 hover:text-slate-200">← 回到网站</Link>
      </form>
    </Frame>
  );
}

function Console({ storage, onLogout }: { storage: StorageInfo; onLogout: () => void }) {
  // 控制台只在浏览器里渲染（先要查完登录状态），所以可以直接读网址和本地设置
  const [section, setSection] = useState<SectionId>(readSection);
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem(COMPACT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'ok' | 'error' | 'info' }[]>([]);
  const [deploy, setDeploy] = useState<{ sha: string; status: Deploy | null } | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    const onPop = () => setSection(readSection());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (id: SectionId) => {
    setSection(id);
    const url = id === 'overview' ? '/admin' : `/admin?s=${id}`;
    window.history.pushState(null, '', url);
    window.scrollTo({ top: 0 });
  };

  const toast = useCallback<AdminContextValue['toast']>((message, tone = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const saved = useCallback<AdminContextValue['saved']>(
    (result: SaveResult, what = '已保存') => {
      if (!result.sha) {
        toast(storage.kind === 'local' ? `${what}（本地模式：已写入磁盘）` : `${what}（没有变化）`, 'ok');
        return;
      }
      toast(`${what}，网站约 1~2 分钟后更新`, 'ok');
      setDeploy({ sha: result.sha, status: null });
    },
    [storage.kind, toast],
  );

  // 保存后每 8 秒查一次部署状态，直到成功或失败（最多 6 分钟）
  useEffect(() => {
    if (!deploy || (deploy.status && deploy.status.state !== 'pending' && deploy.status.state !== 'unknown')) return;
    const started = Date.now();
    let timer = 0;
    const poll = async () => {
      try {
        const status = await api<Deploy>(`/api/admin/deploy?sha=${deploy.sha}`);
        setDeploy((d) => (d && d.sha === deploy.sha ? { ...d, status } : d));
        if (status.state === 'success' || status.state === 'failure' || status.state === 'error') return;
      } catch {
        /* 下次再试 */
      }
      if (Date.now() - started < 6 * 60_000) timer = window.setTimeout(poll, 8000);
    };
    timer = window.setTimeout(poll, 5000);
    return () => window.clearTimeout(timer);
  }, [deploy]);

  const logout = async () => {
    try {
      await api('/api/admin/session', { method: 'DELETE' });
    } finally {
      onLogout();
    }
  };

  const toggleCompact = () => {
    setCompact((c) => {
      try {
        localStorage.setItem(COMPACT_KEY, c ? '0' : '1');
      } catch {
        /* 忽略 */
      }
      return !c;
    });
  };

  const context: AdminContextValue = { toast, saved, storageKind: storage.kind };

  return (
    <AdminContext.Provider value={context}>
      <Frame compact={compact}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-7">
          {/* 侧边栏（手机上变成顶部可横向滑动的一排） */}
          <aside className="admin-panel flex flex-col gap-3 p-4 lg:sticky lg:top-6 lg:w-60 lg:shrink-0 lg:p-5">
            <div className="flex items-start justify-between gap-2 px-1 lg:px-2 lg:pb-2">
              <Link href="/" target="_blank" title="打开网站">
                <p className="text-xl font-black text-white">XHBlogs</p>
                <p className="font-lab text-[10px] tracking-[0.3em] text-indigo-300">CONTROL PANEL</p>
              </Link>
              <button
                type="button"
                onClick={toggleCompact}
                aria-pressed={compact}
                title="简洁模式：去掉背景插画和毛玻璃"
                className={`rounded-xl px-2.5 py-2 text-xs font-bold ${compact ? 'bg-indigo-500 text-white' : 'bg-slate-900/50 text-slate-200 hover:bg-slate-900/70'}`}
              >
                简洁
              </button>
            </div>
            <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0" aria-label="后台板块">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={section === s.id ? 'page' : undefined}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-left text-sm font-bold transition-colors ${
                    section === s.id ? 'bg-indigo-500 text-white shadow-[0_8px_24px_-8px] shadow-indigo-500/80' : 'text-slate-200 hover:bg-white/5'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </nav>
            <div className="hidden border-t border-white/10 pt-3 lg:block">
              <button type="button" onClick={() => void logout()} className="w-full rounded-xl px-4 py-2.5 text-left text-sm font-bold text-rose-400 hover:bg-rose-500/10">
                退出登录
              </button>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col gap-5">
            {storage.kind === 'none' && (
              <p className="rounded-2xl border border-rose-400/30 bg-rose-500/15 px-5 py-3 text-sm text-rose-100">{storage.problem}</p>
            )}
            {deploy && <DeployBanner deploy={deploy.status} onClose={() => setDeploy(null)} />}
            <SectionView section={section} storage={storage} go={go} />
            <button type="button" onClick={() => void logout()} className="admin-panel px-5 py-3 text-left text-sm font-bold text-rose-400 lg:hidden">
              退出登录
            </button>
          </main>
        </div>

        {/* 提示条放在顶部，不挡底部的保存条 */}
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
          {toasts.map((t) => (
            <p
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={`max-w-md rounded-2xl px-5 py-3 text-sm font-bold shadow-xl backdrop-blur-md ${
                t.tone === 'error' ? 'bg-rose-500/90 text-white' : t.tone === 'ok' ? 'bg-emerald-500/90 text-white' : 'bg-slate-800/95 text-slate-100'
              }`}
            >
              {t.message}
            </p>
          ))}
        </div>
      </Frame>
    </AdminContext.Provider>
  );
}

function DeployBanner({ deploy, onClose }: { deploy: Deploy | null; onClose: () => void }) {
  const state = deploy?.state ?? 'pending';
  const text =
    state === 'success'
      ? '网站已经更新好了'
      : state === 'failure' || state === 'error'
        ? `网站部署失败：${deploy?.description || '去 Vercel 看看日志'}`
        : state === 'unknown'
          ? '已提交到 GitHub，等待 Vercel 开始部署…'
          : '网站正在部署，大约 1~2 分钟…';
  const tone =
    state === 'success' ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100' : state === 'failure' || state === 'error' ? 'border-rose-400/30 bg-rose-500/15 text-rose-100' : 'border-indigo-400/30 bg-indigo-500/15 text-indigo-100';
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-3 text-sm ${tone}`} role="status">
      {state === 'pending' || state === 'unknown' ? <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300" /> : null}
      <span className="flex-1">{text}</span>
      {deploy?.url && (
        <a href={deploy.url} target="_blank" rel="noreferrer" className="text-xs font-bold underline">
          部署详情
        </a>
      )}
      <button type="button" onClick={onClose} className="text-xs opacity-70 hover:opacity-100" aria-label="关闭">
        ✕
      </button>
    </div>
  );
}

function SectionView({ section, storage, go }: { section: SectionId; storage: StorageInfo; go: (id: SectionId) => void }) {
  switch (section) {
    case 'posts':
    case 'chatters':
    case 'moments':
    case 'about':
      return <ContentSection key={section} kind={section} />;
    case 'music':
      return <MusicSection />;
    case 'danmaku':
      return <DanmakuSection />;
    case 'appearance':
      return <AppearanceSection />;
    case 'albums':
      return <AlbumsSection />;
    case 'friends':
      return <FriendsSection />;
    case 'projects':
      return <ProjectsSection />;
    case 'settings':
      return <SettingsSection />;
    default:
      return <Overview storage={storage} go={go} />;
  }
}

interface OverviewData {
  counts: Record<'posts' | 'chatters' | 'moments' | 'songs' | 'albums' | 'photos' | 'friends' | 'projects', number>;
  commits: { sha: string; message: string; date: string; url: string }[];
  deploy: Deploy | null;
}

function Overview({ storage, go }: { storage: StorageInfo; go: (id: SectionId) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<OverviewData>('/api/admin/overview')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : '加载失败'));
  }, []);

  const cards: { label: string; value: (d: OverviewData) => string; to: SectionId }[] = [
    { label: '文章', value: (d) => `${d.counts.posts}`, to: 'posts' },
    { label: '杂谈', value: (d) => `${d.counts.chatters}`, to: 'chatters' },
    { label: '说说', value: (d) => `${d.counts.moments}`, to: 'moments' },
    { label: '歌曲', value: (d) => `${d.counts.songs}`, to: 'music' },
    { label: '照片', value: (d) => `${d.counts.photos}`, to: 'albums' },
    { label: '友链', value: (d) => `${d.counts.friends}`, to: 'friends' },
    { label: '项目', value: (d) => `${d.counts.projects}`, to: 'projects' },
  ];

  const deployText: Record<Deploy['state'], string> = { success: '已上线', pending: '部署中', failure: '部署失败', error: '部署失败', unknown: '—' };

  return (
    <Panel
      title={`欢迎回来，${siteConfig.authorName}`}
      subtitle={
        storage.kind === 'github'
          ? `保存的修改会提交到 ${storage.target}，Vercel 自动部署`
          : storage.kind === 'local'
            ? `本地模式：修改直接写入 ${storage.target}`
            : '还没配置存储'
      }
      actions={
        <>
          <Button tone="primary" size="md" onClick={() => go('posts')}>写文章</Button>
          <Button tone="indigo" size="md" onClick={() => go('moments')}>发说说</Button>
        </>
      }
    >
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {cards.map((c) => (
              <button key={c.label} type="button" onClick={() => go(c.to)} className="admin-row flex flex-col items-start gap-1 px-4 py-4 text-left hover:bg-white/5">
                <span className="font-lab text-2xl font-black text-white">{c.value(data)}</span>
                <span className="admin-hint text-xs">{c.label}</span>
              </button>
            ))}
          </div>
          {storage.kind === 'github' && (
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-3 text-sm font-black text-indigo-200">
                最近的修改
                {data.deploy && (
                  <span className={`rounded-md px-2 py-0.5 text-[11px] ${data.deploy.state === 'success' ? 'bg-emerald-500/20 text-emerald-200' : data.deploy.state === 'pending' ? 'bg-indigo-500/20 text-indigo-200' : 'bg-rose-500/20 text-rose-200'}`}>
                    最新一次：{deployText[data.deploy.state]}
                  </span>
                )}
              </h3>
              {data.commits.map((c) => (
                <Row key={c.sha} className="py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{c.message}</span>
                  <span className="admin-hint font-lab text-[11px]">{new Date(c.date).toLocaleString('zh-CN', { hour12: false })}</span>
                  <a href={c.url} target="_blank" rel="noreferrer" className="font-lab text-[11px] text-indigo-300 hover:underline">
                    {c.sha.slice(0, 7)}
                  </a>
                </Row>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
