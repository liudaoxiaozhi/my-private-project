'use client';
// app/media/useMediaLibrary.ts —— 书影音页和想看清单共用：条目列表、能不能编辑、密钥状态、保存 / 快捷更新 / 删除
//
// 页面是静态生成的：打开后再问一次 /api/anime/editor，本地开发模式或登录了网页后台就打开编辑。
import { useEffect, useState } from 'react';
import { useToast } from '../../components/ToastProvider';
import { isSameWork, verbOf, type AnimeEntry, type AnimeInput, type WorkIds } from '../../lib/anime';
import type { CredentialService, Credentials } from './AnimeSearch';

async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  return data;
}

export interface MediaLibraryProps {
  initialEntries: AnimeEntry[];
  /** 构建时就能编辑（本地开发模式） */
  editable: boolean;
  /** 服务端是否已保存 TMDB Key / Bangumi 令牌；没有时可以在搜索弹窗里填 */
  initialCredentials: Credentials;
}

export function useMediaLibrary({ initialEntries, editable: buildEditable, initialCredentials }: MediaLibraryProps) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState(initialEntries);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState(initialCredentials);
  const [editable, setEditable] = useState(buildEditable);
  useEffect(() => {
    if (buildEditable) return;
    let alive = true;
    fetch('/api/anime/editor', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ editable: boolean; credentials?: Credentials }>) : null))
      .then((data) => {
        if (!alive || !data?.editable) return;
        setEditable(true);
        if (data.credentials) setCredentials(data.credentials);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [buildEditable]);

  const upsert = (entry: AnimeEntry) =>
    setEntries((list) => (list.some((e) => e.id === entry.id) ? list.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...list]));

  const findExisting = (ids: WorkIds) => entries.find((e) => isSameWork(e, ids));

  /** 新建（id 为 null）或保存修改，成功后更新列表；失败时抛出错误，由调用方显示 */
  const saveEntry = async (id: string | null, input: AnimeInput): Promise<AnimeEntry> => {
    const { entry } = id
      ? await request<{ entry: AnimeEntry }>(`/api/anime/${encodeURIComponent(id)}`, 'PUT', input)
      : await request<{ entry: AnimeEntry }>('/api/anime', 'POST', input);
    upsert(entry);
    return entry;
  };

  /** 卡片上的快捷操作（+1 集 / 标记看过 / 开始看），出错时弹提示 */
  const quickUpdate = async (entry: AnimeEntry, next: AnimeInput): Promise<void> => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      const saved = await saveEntry(entry.id, next);
      const verb = verbOf(saved.kind);
      if (saved.status === 'completed' && entry.status !== 'completed') showToast(`《${saved.title}》${verb}完啦 🎉`, 'success');
      else if (saved.status === 'watching' && entry.status === 'planned') showToast(`开始${verb}《${saved.title}》`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** 删除；失败时抛出错误 */
  const removeEntry = async (entry: AnimeEntry): Promise<void> => {
    await request(`/api/anime/${encodeURIComponent(entry.id)}`, 'DELETE');
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    showToast(`已删除《${entry.title}》`, 'info');
  };

  const credentialSaved = (service: CredentialService, nickname?: string) => {
    setCredentials((c) => ({ ...c, [service]: true }));
    showToast(service === 'tmdb' ? 'TMDB Key 已保存' : `已登录 Bangumi：${nickname ?? ''}`, 'success');
  };

  return { entries, editable, credentials, busyId, findExisting, saveEntry, quickUpdate, removeEntry, credentialSaved, showToast };
}

export type MediaLibrary = ReturnType<typeof useMediaLibrary>;
