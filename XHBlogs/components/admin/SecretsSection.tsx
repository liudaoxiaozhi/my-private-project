"use client";
// components/admin/SecretsSection.tsx —— 后台的书影音与密钥板块：TMDB Key、Bangumi 令牌、Gemini Key
//
// 密钥加密后存进仓库（lib/server/admin/secrets.ts）；在 Vercel 环境变量里配了的，以环境变量为准。
// 书影音条目本身在 /media 页上编辑：登录了后台，书影音页就会出现「添加」和编辑按钮，想看清单上能「开始看」、移除。
import { useState } from 'react';
import { api } from '../../lib/admin/client';
import type { SaveResult } from '../../lib/admin/client';
import { Button, ConfirmButton, Loading, Panel, Row, inputClass, useAdmin, useLoader } from './ui';

type Status = 'env' | 'stored' | 'unreadable' | 'none';
type Name = 'TMDB_API_KEY' | 'BANGUMI_ACCESS_TOKEN' | 'GEMINI_API_KEY';

const SECRETS: { name: Name; label: string; hint: string; link: string }[] = [
  { name: 'TMDB_API_KEY', label: 'TMDB Key', hint: '书影音页添加电影 / 电视剧时搜索用；v3 的 API Key 或 v4 的 Read Access Token 都行', link: 'https://www.themoviedb.org/settings/api' },
  { name: 'BANGUMI_ACCESS_TOKEN', label: 'Bangumi 令牌', hint: '可选：登录后 Bangumi 搜索（番剧 / 书 / 音乐）能搜到全部条目', link: 'https://next.bgm.tv/demo/access-token' },
  { name: 'GEMINI_API_KEY', label: 'Gemini Key', hint: '右下角桌宠聊天用（Google AI Studio 申请）', link: 'https://aistudio.google.com/app/apikey' },
];

const STATUS_TEXT: Record<Status, { text: string; tone: string }> = {
  env: { text: '在 Vercel 环境变量里', tone: 'bg-sky-500/20 text-sky-200' },
  stored: { text: '已保存（加密）', tone: 'bg-emerald-500/20 text-emerald-200' },
  unreadable: { text: '需要重新填写', tone: 'bg-rose-500/20 text-rose-200' },
  none: { text: '没有配置', tone: 'bg-white/10 text-slate-300' },
};

export default function SecretsSection() {
  const [status, setStatus] = useState<Record<Name, Status> | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Name, string>>>({});
  const [busy, setBusy] = useState<Name | null>(null);
  const { toast, saved } = useAdmin();
  useLoader<{ status: Record<Name, Status> }>('/api/admin/secrets', (d) => setStatus(d.status));

  const save = async (name: Name, value: string) => {
    setBusy(name);
    try {
      const res = await api<SaveResult & { status: Record<Name, Status> }>('/api/admin/secrets', { method: 'PUT', body: { name, value } });
      setStatus(res.status);
      setDrafts((d) => ({ ...d, [name]: '' }));
      saved(res, value ? '密钥已保存' : '密钥已删除');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="书影音"
        subtitle="书影音条目直接在书影音页上编辑：登录了后台，页面上就会出现「添加」和编辑按钮，想看清单上能「开始看」、移除，保存后同样提交到 GitHub"
        actions={
          <>
            <a href="/media" target="_blank" rel="noreferrer" className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-400">
              打开书影音
            </a>
            <a href="/media/wishlist" target="_blank" rel="noreferrer" className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20">
              想看清单
            </a>
          </>
        }
      >
        <p className="admin-hint text-xs leading-relaxed">
          番剧、书、音乐用 Bangumi 搜（不用密钥也能搜，登录后条目更全）；外文书还可以用 Open Library（不用密钥）；电影 / 电视剧用 TMDB，要先在下面填 TMDB Key。
        </p>
      </Panel>
      <Panel
        title="密钥"
        subtitle="加密后存进仓库（只有密文），用管理员密码派生的钥匙加密；改了 ADMIN_PASSWORD 后需要重新填一次。在 Vercel 环境变量里配了的，以环境变量为准"
      >
        {!status ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-3">
            {SECRETS.map((s) => (
              <Row key={s.name} className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <div className="min-w-[12rem] flex-1">
                  <p className="flex items-center gap-2 text-sm font-bold text-white">
                    {s.label}
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${STATUS_TEXT[status[s.name]].tone}`}>{STATUS_TEXT[status[s.name]].text}</span>
                  </p>
                  <p className="admin-hint mt-0.5 text-[11px] leading-relaxed">
                    {s.hint} ·{' '}
                    <a href={s.link} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline">
                      去申请
                    </a>
                  </p>
                </div>
                {status[s.name] !== 'env' && (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      value={drafts[s.name] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.name]: e.target.value }))}
                      placeholder={status[s.name] === 'stored' ? '填新的就会替换' : '粘贴到这里'}
                      aria-label={s.label}
                      className={`${inputClass} py-2 text-xs`}
                    />
                    <Button tone="primary" disabled={busy !== null || !drafts[s.name]?.trim()} onClick={() => void save(s.name, drafts[s.name] ?? '')}>
                      {busy === s.name ? '验证中…' : '保存'}
                    </Button>
                    {(status[s.name] === 'stored' || status[s.name] === 'unreadable') && (
                      <ConfirmButton disabled={busy !== null} onConfirm={() => void save(s.name, '')}>
                        删除
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </Row>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
