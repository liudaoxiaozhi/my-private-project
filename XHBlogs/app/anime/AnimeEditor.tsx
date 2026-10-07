'use client';
// app/anime/AnimeEditor.tsx —— 添加（先搜 Bangumi，再确认信息）/ 编辑追番条目
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ExternalLink, Loader2, Minus, PencilLine, Plus, Search, Trash2 } from 'lucide-react';
import AppImage from '../../components/AppImage';
import AnimeModal from './AnimeModal';
import { AnimeCover } from './AnimeCard';
import {
  KIND_LABEL,
  KIND_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  bangumiUrl,
  emptyInput,
  inputFromSubject,
  toInput,
  withStatus,
  type AnimeEntry,
  type AnimeInput,
  type BangumiSubject,
} from '../../lib/anime';

interface AnimeEditorProps {
  /** 有值时为编辑模式 */
  entry: AnimeEntry | null;
  /** 已在列表里的条目，用来提示重复添加 */
  findByBangumiId: (id: number) => AnimeEntry | undefined;
  onSave: (input: AnimeInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onOpenExisting: (entry: AnimeEntry) => void;
  onClose: () => void;
}

const INPUT_BASE =
  'rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-white/10 dark:bg-slate-800/80 dark:text-white';
const INPUT = `${INPUT_BASE} w-full`;

const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${active ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`;

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const toInt = (value: string): number => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const parseTags = (text: string): string[] => [...new Set(text.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean))];

// ============================== 搜索 ==============================

function BangumiSearch({
  onPick,
  onManual,
  findByBangumiId,
}: {
  onPick: (subject: BangumiSubject) => void;
  onManual: (title: string) => void;
  findByBangumiId: (id: number) => AnimeEntry | undefined;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BangumiSubject[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json().catch(() => ({}))) as { results?: BangumiSubject[]; error?: string };
      if (!res.ok) throw new Error(data.error || `搜索失败（HTTP ${res.status}）`);
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="番名，或 Bangumi 条目链接 / 编号"
          className={INPUT}
          aria-label="搜索 Bangumi"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-500 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} 搜索
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        从 <a href="https://bgm.tv" target="_blank" rel="noreferrer" className="font-bold text-indigo-500 hover:underline">Bangumi</a> 自动填好封面、集数和首播日期；搜不到也可以
        <button type="button" onClick={() => onManual(query.trim())} className="ml-1 font-bold text-indigo-500 hover:underline">
          手动填写
        </button>
        。
      </p>

      {error && <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}

      {results && results.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">没有搜到，换个名字（原名 / 简称）试试，或者手动填写。</p>
      )}

      {results && results.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {results.map((s) => {
            const existing = findByBangumiId(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="flex w-full items-start gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
                    {s.cover && <AppImage src={s.cover} alt="" fill sizes="56px" className="object-cover" referrerPolicy="no-referrer" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-slate-900 dark:text-white">{s.title}</span>
                      {existing && (
                        <span className="shrink-0 rounded-full bg-indigo-500/15 px-2 py-px text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                          已添加 · {STATUS_LABEL[existing.status]}
                        </span>
                      )}
                    </p>
                    {s.originalTitle !== s.title && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{s.originalTitle}</p>}
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
                      {[
                        KIND_LABEL[s.kind],
                        s.platform && s.platform !== KIND_LABEL[s.kind] ? s.platform : '',
                        s.airDate.slice(0, 4),
                        s.totalEpisodes > 0 && s.kind !== 'movie' ? `${s.totalEpisodes} 集` : '',
                        s.score > 0 ? `Bangumi ${s.score.toFixed(1)}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {s.summary && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500/90 dark:text-slate-400/90">{s.summary}</p>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================== 表单 ==============================

export default function AnimeEditor({ entry, findByBangumiId, onSave, onDelete, onOpenExisting, onClose }: AnimeEditorProps) {
  const isEdit = entry !== null;
  const [step, setStep] = useState<'search' | 'form'>(isEdit ? 'form' : 'search');
  const [form, setForm] = useState<AnimeInput>(() => (entry ? toInput(entry) : emptyInput()));
  const [tagsText, setTagsText] = useState(() => (entry ? entry.tags.join(' ') : ''));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const update = (patch: Partial<AnimeInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const pick = (subject: BangumiSubject) => {
    const existing = findByBangumiId(subject.id);
    if (existing) {
      onOpenExisting(existing);
      return;
    }
    const next = inputFromSubject(subject);
    setForm(next);
    setTagsText(next.tags.join(' '));
    setStep('form');
    setDirty(true);
  };

  const manual = (title: string) => {
    setForm({ ...emptyInput(), title });
    setTagsText('');
    setStep('form');
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!form.title.trim()) {
      setError('标题不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, tags: parseTags(tagsText) });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const isMovie = form.kind === 'movie';

  const footer =
    step === 'form' ? (
      <>
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${confirmDelete ? 'bg-red-500 text-white hover:bg-red-600' : 'text-red-500 hover:bg-red-500/10'}`}
          >
            <Trash2 size={15} /> {confirmDelete ? '确认删除' : '删除'}
          </button>
        )}
        {!isEdit && (
          <button type="button" onClick={() => setStep('search')} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
            重新搜索
          </button>
        )}
        <span className="flex-1" />
        {error && <span className="w-full text-right text-sm font-bold text-red-500 sm:w-auto">{error}</span>}
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">
          取消
        </button>
        <button
          type="submit"
          form="anime-editor-form"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-colors hover:bg-indigo-600 disabled:opacity-60"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {isEdit ? '保存' : '添加'}
        </button>
      </>
    ) : undefined;

  return (
    <AnimeModal
      title={entry ? `编辑：${entry.title}` : step === 'search' ? '添加追番' : '确认信息'}
      onClose={onClose}
      footer={footer}
      confirmClose={() => !dirty || window.confirm('还没保存，确定要关闭吗？')}
    >
      {step === 'search' ? (
        <BangumiSearch onPick={pick} onManual={manual} findByBangumiId={findByBangumiId} />
      ) : (
        <form id="anime-editor-form" onSubmit={submit} className="space-y-5">
          <div className="flex gap-4">
            <div className="w-24 shrink-0 sm:w-32">
              <AnimeCover entry={{ title: form.title || '?', cover: form.cover }} sizes="128px" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <Field label="标题 *">
                <input value={form.title} onChange={(e) => update({ title: e.target.value })} className={INPUT} required maxLength={200} />
              </Field>
              <Field label="原名">
                <input value={form.originalTitle} onChange={(e) => update({ originalTitle: e.target.value })} className={INPUT} maxLength={200} />
              </Field>
              {form.bangumiId && (
                <a
                  href={bangumiUrl(form.bangumiId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-wrap items-center gap-x-1 text-xs font-bold text-indigo-500 hover:underline"
                >
                  Bangumi #{form.bangumiId} <ExternalLink size={12} />
                  {form.bangumiScore > 0 && <span className="text-slate-500 dark:text-slate-400">站内 {form.bangumiScore.toFixed(1)} 分</span>}
                </a>
              )}
            </div>
          </div>

          <Field label="封面地址（Bangumi 封面保存时会自动下载到本地）">
            <input
              value={form.cover}
              onChange={(e) => update({ cover: e.target.value })}
              className={INPUT}
              placeholder="https://… 或 /anime/covers/xxx.jpg"
              maxLength={1000}
            />
          </Field>

          <div>
            <span className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">类型</span>
            <div className="flex flex-wrap gap-2">
              {KIND_ORDER.map((k) => (
                <button key={k} type="button" onClick={() => update({ kind: k })} className={chip(form.kind === k)} aria-pressed={form.kind === k}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">状态</span>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setForm((f) => withStatus(f, s));
                    setDirty(true);
                  }}
                  className={chip(form.status === s)}
                  aria-pressed={form.status === s}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {!isMovie && (
            <div>
              <span className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">进度</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update({ progress: Math.max(0, form.progress - 1) })}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  aria-label="少看一集"
                >
                  <Minus size={16} />
                </button>
                <input
                  inputMode="numeric"
                  value={form.progress || ''}
                  onChange={(e) => update({ progress: toInt(e.target.value) })}
                  placeholder="0"
                  className={`${INPUT_BASE} w-20 text-center tabular-nums`}
                  aria-label="已看集数"
                />
                <button
                  type="button"
                  onClick={() =>
                    update({ progress: form.totalEpisodes > 0 ? Math.min(form.totalEpisodes, form.progress + 1) : form.progress + 1 })
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  aria-label="多看一集"
                >
                  <Plus size={16} />
                </button>
                <span className="px-1 text-slate-400">/</span>
                <input
                  inputMode="numeric"
                  value={form.totalEpisodes || ''}
                  onChange={(e) => update({ totalEpisodes: toInt(e.target.value) })}
                  placeholder="?"
                  className={`${INPUT_BASE} w-20 text-center tabular-nums`}
                  aria-label="总集数"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">集</span>
              </div>
              {form.totalEpisodes > 0 && form.progress > form.totalEpisodes && (
                <p className="mt-1 text-xs text-amber-600">已看集数超过了总集数，保存时会按总集数计。</p>
              )}
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">我的评分{form.rating > 0 ? `：${form.rating} / 10` : ''}</span>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => update({ rating: form.rating === n ? 0 : n })}
                  className={`h-8 w-8 rounded-lg text-xs font-black tabular-nums transition-colors ${n <= form.rating ? 'bg-amber-400 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-amber-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-amber-500/20'}`}
                  aria-label={`${n} 分`}
                  aria-pressed={form.rating === n}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={isMovie ? '上映日期' : '首播日期'}>
              <input type="date" value={form.airDate} onChange={(e) => update({ airDate: e.target.value })} className={INPUT} />
            </Field>
            <Field label="开始看">
              <input type="date" value={form.startedAt} onChange={(e) => update({ startedAt: e.target.value })} className={INPUT} />
            </Field>
            <Field label="看完">
              <input type="date" value={form.finishedAt} onChange={(e) => update({ finishedAt: e.target.value })} className={INPUT} />
            </Field>
          </div>

          <Field label="标签（空格或逗号分隔）">
            <input
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                setDirty(true);
              }}
              className={INPUT}
              placeholder="治愈 奇幻 原创"
            />
          </Field>

          <Field label="短评">
            <textarea
              value={form.comment}
              onChange={(e) => update({ comment: e.target.value })}
              rows={4}
              maxLength={2000}
              className={`${INPUT} resize-y leading-relaxed`}
              placeholder="看完的感想、喜欢的角色、名场面……"
            />
          </Field>

          {!isEdit && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <PencilLine size={13} /> 信息都可以改，之后在卡片上点一下就能再编辑。
            </p>
          )}
        </form>
      )}
    </AnimeModal>
  );
}
