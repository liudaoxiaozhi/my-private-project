"use client";
// components/admin/RebuildStatus.tsx —— 自己的服务器上（本地存储 + SELF_HOST_REBUILD=1）：网站重建的进度
//
// - RebuildPanel：概览里的一块，显示 排队中 / 重建中 / 已上线 / 失败 和时间，失败时可以展开日志，「立即重建」
// - RebuildBanner：保存后显示在顶部，跟到这次修改上线（或失败）为止
// 状态来自 /api/admin/rebuild（lib/server/admin/rebuild.ts），忙的时候每 2 秒查一次。
import { useEffect, useState } from 'react';
import { api } from '../../lib/admin/client';
import { Button } from './ui';

export type RebuildState = 'idle' | 'queued' | 'building' | 'ready' | 'failed';

export interface RebuildInfo {
  enabled: boolean;
  status: {
    state: RebuildState;
    requestedAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    reason: string;
    log: string;
  };
  /** 还有修改没包含进当前这次构建：做完会再构建一次 */
  pending: boolean;
}

const LABEL: Record<RebuildState, string> = { idle: '还没有重建过', queued: '排队中', building: '重建中', ready: '已上线', failed: '失败' };

const BADGE: Record<RebuildState, string> = {
  idle: 'bg-slate-500/20 text-slate-200',
  queued: 'bg-indigo-500/20 text-indigo-200',
  building: 'bg-indigo-500/20 text-indigo-200',
  ready: 'bg-emerald-500/20 text-emerald-200',
  failed: 'bg-rose-500/20 text-rose-200',
};

const busy = (info: RebuildInfo): boolean => info.status.state === 'queued' || info.status.state === 'building' || info.pending;

const formatTime = (iso: string | null): string => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '');

function duration(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

/** 查一次状态，忙的时候每 2 秒再查（网站重启的那几秒连不上，稍后再试）；最多跟 20 分钟。poke() 重新开始 */
function useRebuildInfo(initial: RebuildInfo | null) {
  const [info, setInfo] = useState<RebuildInfo | null>(initial);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const started = Date.now();
    const poll = async () => {
      let next: RebuildInfo | null = null;
      try {
        next = await api<RebuildInfo>('/api/admin/rebuild');
        if (alive) setInfo(next);
      } catch {
        /* 下次再试 */
      }
      if (!alive) return;
      if ((next === null || busy(next)) && Date.now() - started < 20 * 60_000) timer = window.setTimeout(poll, next ? 2000 : 4000);
    };
    timer = window.setTimeout(poll, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [round]);
  return { info, setInfo, poke: () => setRound((r) => r + 1) };
}

/** 概览里的「网站重建」 */
export function RebuildPanel({ initial }: { initial: RebuildInfo | null }) {
  const { info, setInfo, poke } = useRebuildInfo(initial);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const rebuildNow = async () => {
    setStarting(true);
    setError('');
    try {
      setInfo(await api<RebuildInfo>('/api/admin/rebuild', { method: 'POST' }));
      poke();
    } catch (e) {
      setError(e instanceof Error ? e.message : '没能开始重建');
    } finally {
      setStarting(false);
    }
  };

  const status = info?.status;
  const state: RebuildState = status?.state ?? 'idle';
  const time = !status ? '' : formatTime(state === 'queued' ? status.requestedAt : state === 'building' ? status.startedAt : status.finishedAt);
  const reason = status?.reason ? `「${status.reason}」` : '';
  const again = info?.pending ? '；完成后还会再重建一次，带上这期间的修改' : '';
  const detail =
    state === 'queued'
      ? `最近的修改${reason}马上开始重建`
      : state === 'building'
        ? `正在构建${reason}，大约 1~3 分钟${again}`
        : state === 'ready'
          ? `最近一次${reason}用时 ${duration(status?.startedAt ?? null, status?.finishedAt ?? null)}${again}`
          : state === 'failed'
            ? `${reason || '最近一次'}没能上线，网站还是之前的版本${again}`
            : '保存后会自动重建；改了服务器上的配置（.env.production.local）也可以点「立即重建」';

  return (
    <section aria-label="网站重建" className="flex flex-col gap-2">
      <h3 className="flex flex-wrap items-center gap-3 text-sm font-black text-indigo-200">
        网站重建
        <span className={`rounded-md px-2 py-0.5 text-[11px] ${BADGE[state]}`} data-state={state}>
          {LABEL[state]}
        </span>
        {time && <span className="admin-hint font-lab text-[11px] font-normal">{time}</span>}
        {(state === 'queued' || state === 'building') && <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300" />}
        <Button tone="indigo" className="ml-auto" disabled={starting || state === 'queued' || state === 'building'} onClick={() => void rebuildNow()}>
          {starting ? '正在开始…' : '立即重建'}
        </Button>
      </h3>
      <p className="admin-hint text-xs">{detail}</p>
      {error && <p className="text-xs text-rose-300" role="alert">{error}</p>}
      {state === 'failed' && status?.log && (
        <details className="admin-row px-4 py-3 text-xs text-slate-200">
          <summary className="cursor-pointer font-bold text-rose-200">查看日志（最后几十行，完整的在服务器上的 .rebuild.log）</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-slate-300">{status.log}</pre>
        </details>
      )}
    </section>
  );
}

/** 保存后顶部的进度条：排队 → 重建中 → 网站已经更新好了 / 失败 */
export function RebuildBanner({ onClose, onDetails }: { onClose: () => void; onDetails?: () => void }) {
  const { info } = useRebuildInfo(null);
  const state: RebuildState = info?.status.state ?? 'queued';
  const pending = info?.pending ?? false;
  const finished = !pending && (state === 'ready' || state === 'failed' || state === 'idle');
  const text = finished
    ? state === 'failed'
      ? '网站重建失败，线上还是之前的版本'
      : '网站已经更新好了'
    : state === 'building'
      ? `网站正在重建，大约 1~3 分钟后上线…${pending ? '（做完会再重建一次，带上刚才的修改）' : ''}`
      : '已保存，网站马上开始重建…';
  const tone = finished
    ? state === 'failed'
      ? 'border-rose-400/30 bg-rose-500/15 text-rose-100'
      : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'
    : 'border-indigo-400/30 bg-indigo-500/15 text-indigo-100';
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-3 text-sm ${tone}`} role="status" aria-label="网站重建进度">
      {!finished && <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300" />}
      <span className="flex-1">{text}</span>
      {finished && state === 'failed' && onDetails && (
        <button type="button" onClick={onDetails} className="text-xs font-bold underline">
          查看日志
        </button>
      )}
      <button type="button" onClick={onClose} className="text-xs opacity-70 hover:opacity-100" aria-label="关闭">
        ✕
      </button>
    </div>
  );
}
