'use client';
// app/media/AnimeEditor.tsx —— 添加（先搜 Bangumi / TMDB / Open Library，再确认信息）/ 编辑书影音条目
//
// 状态是「想看 / 想读 / 想听」时多出想看清单的字段：优先级、想看的理由、在哪看（这些字段换了状态也会保留）。
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ExternalLink, Loader2, Minus, PencilLine, Plus, RefreshCw, Trash2 } from 'lucide-react';
import AnimeModal from './AnimeModal';
import AnimeSearch, { type CredentialService, type Credentials } from './AnimeSearch';
import PartsProgress from './PartsProgress';
import { AnimeCover } from './AnimeCard';
import {
  KIND_LABEL,
  KIND_ORDER,
  PLATFORM_SUGGESTIONS,
  PRIORITY_MAX,
  PROGRESS_UNIT,
  SECTION_DEFAULT_KIND,
  STATUS_ORDER,
  bangumiUrl,
  creatorLabel,
  dateLabels,
  emptyInput,
  hasParts,
  isSingleMovie,
  openLibraryUrl,
  sectionOf,
  statusLabel,
  toInput,
  tmdbUrl,
  verbOf,
  withProgress,
  withStatus,
  type AnimeEntry,
  type AnimeInput,
  type AnimeKind,
  type MediaSection,
  type TmdbDetail,
  type WorkIds,
} from '../../lib/anime';

interface AnimeEditorProps {
  /** 有值时为编辑模式 */
  entry: AnimeEntry | null;
  /** 新建时的默认类型（页面当前所在的大类 / 小类） */
  defaultKind?: AnimeKind;
  /** 已在列表里的同一部（按 Bangumi / TMDB / Open Library 编号），用来提示重复添加 */
  findExisting: (ids: WorkIds) => AnimeEntry | undefined;
  credentials: Credentials;
  onCredentialSaved: (service: CredentialService, nickname?: string) => void;
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

// ============================== 表单 ==============================

export default function AnimeEditor({
  entry,
  defaultKind = 'anime',
  findExisting,
  credentials,
  onCredentialSaved,
  onSave,
  onDelete,
  onOpenExisting,
  onClose,
}: AnimeEditorProps) {
  const isEdit = entry !== null;
  const [step, setStep] = useState<'search' | 'form'>(isEdit ? 'form' : 'search');
  const [form, setForm] = useState<AnimeInput>(() => (entry ? toInput(entry) : emptyInput()));
  const [tagsText, setTagsText] = useState(() => (entry ? entry.tags.join(' ') : ''));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const update = (patch: Partial<AnimeInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const applyDraft = (next: AnimeInput) => {
    setForm(next);
    setTagsText(next.tags.join(' '));
    setStep('form');
    setDirty(true);
  };

  const manual = (title: string, section: MediaSection) => {
    const kind = sectionOf(defaultKind) === section ? defaultKind : SECTION_DEFAULT_KIND[section];
    setForm({ ...emptyInput(), kind, title });
    setTagsText('');
    setStep('form');
  };

  const setProgress = (progress: number) => {
    setForm((f) => withProgress(f, progress));
    setDirty(true);
  };

  /** 剧还在更新时，从 TMDB 重新拿季 / 集数（已看进度保留） */
  const refreshFromTmdb = async () => {
    if (!form.tmdbId || !form.tmdbType || refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch(`/api/anime/tmdb?type=${form.tmdbType}&id=${form.tmdbId}`);
      const data = (await res.json().catch(() => ({}))) as Partial<TmdbDetail> & { error?: string };
      if (!res.ok || !data.draft) throw new Error(data.error || `更新失败（HTTP ${res.status}）`);
      const { parts, totalEpisodes, tmdbScore, cover } = data.draft;
      // 出了新一季时，「看过」会自动回到「在看」
      setForm((f) => withProgress({ ...f, parts, totalEpisodes, tmdbScore, cover: f.cover || cover }, f.progress));
      setDirty(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setRefreshing(false);
    }
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
  const multiPart = hasParts(form);
  const unit = PROGRESS_UNIT[form.kind];
  const verb = verbOf(form.kind);
  const labels = dateLabels(form.kind);
  const creator = creatorLabel(form.kind);
  const platformLabel = `在哪${verb}`;
  const canRefresh = credentials.tmdb && !!form.tmdbId && (form.tmdbType === 'tv' || form.tmdbType === 'collection');

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
      title={entry ? `编辑：${entry.title}` : step === 'search' ? '添加到书影音' : '确认信息'}
      onClose={onClose}
      footer={footer}
      confirmClose={() => !dirty || window.confirm('还没保存，确定要关闭吗？')}
    >
      {step === 'search' ? (
        <AnimeSearch
          initialSection={sectionOf(defaultKind)}
          credentials={credentials}
          onCredentialSaved={onCredentialSaved}
          findExisting={findExisting}
          onDraft={applyDraft}
          onOpenExisting={onOpenExisting}
          onManual={manual}
          inputClassName={INPUT}
        />
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
              {creator && (
                <Field label={creator}>
                  <input value={form.creator} onChange={(e) => update({ creator: e.target.value })} className={INPUT} maxLength={100} />
                </Field>
              )}
              {form.openLibraryKey && (
                <a
                  href={openLibraryUrl(form.openLibraryKey)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-x-1 text-xs font-bold text-indigo-500 hover:underline"
                >
                  Open Library {form.openLibraryKey} <ExternalLink size={12} />
                </a>
              )}
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
              {form.tmdbId && form.tmdbType && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a
                    href={tmdbUrl(form.tmdbType, form.tmdbId)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex flex-wrap items-center gap-x-1 text-xs font-bold text-indigo-500 hover:underline"
                  >
                    TMDB #{form.tmdbId} <ExternalLink size={12} />
                    {form.tmdbScore > 0 && <span className="text-slate-500 dark:text-slate-400">评分 {form.tmdbScore.toFixed(1)}</span>}
                  </a>
                  {canRefresh && (
                    <button
                      type="button"
                      onClick={refreshFromTmdb}
                      disabled={refreshing}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-500 disabled:opacity-50 dark:text-slate-400"
                      title="出了新一季 / 新一部时点一下"
                    >
                      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                      {form.tmdbType === 'tv' ? '更新季 / 集数' : '更新系列'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <Field label="封面地址（Bangumi / TMDB / Open Library 的封面保存时会自动下载到本地）">
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
                  {statusLabel(s, form.kind)}
                </button>
              ))}
            </div>
          </div>

          {form.status === 'planned' && (
            <div className="space-y-3 rounded-2xl bg-sky-500/5 p-4 ring-1 ring-sky-500/20">
              <p className="text-xs font-black text-sky-700 dark:text-sky-300">想{verb}清单</p>
              <div>
                <span className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">优先级</span>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: PRIORITY_MAX + 1 }, (_, n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => update({ priority: n })}
                      className={chip(form.priority === n)}
                      aria-pressed={form.priority === n}
                      aria-label={n === 0 ? '不设优先级' : `优先级 ${n}`}
                    >
                      {n === 0 ? '不设' : '★'.repeat(n)}
                    </button>
                  ))}
                </div>
              </div>
              <Field label={`为什么想${verb}`}>
                <textarea
                  value={form.wishReason}
                  onChange={(e) => update({ wishReason: e.target.value })}
                  rows={2}
                  maxLength={500}
                  className={`${INPUT} resize-y leading-relaxed`}
                  placeholder="朋友安利、看了预告、想补的经典……"
                />
              </Field>
              <Field label={platformLabel}>
                <input value={form.platform} onChange={(e) => update({ platform: e.target.value })} className={INPUT} maxLength={40} />
              </Field>
              <div className="-mt-1 flex flex-wrap gap-1.5" role="group" aria-label={`${platformLabel}：常用`}>
                {PLATFORM_SUGGESTIONS[sectionOf(form.kind)].map((p) => (
                  <button key={p} type="button" onClick={() => update({ platform: p })} className={chip(form.platform === p)} aria-pressed={form.platform === p}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {multiPart && (
            <div>
              <span className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">
                进度（{isMovie ? `共 ${form.parts.length} 部` : `共 ${form.parts.length} 季 ${form.totalEpisodes} 集`}）
              </span>
              <PartsProgress
                parts={form.parts}
                progress={form.progress}
                isMovie={isMovie}
                inputClassName={INPUT_BASE}
                onChange={setProgress}
              />
            </div>
          )}

          {!multiPart && !isSingleMovie(form) && (
            <div>
              <span className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">进度</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProgress(form.progress - 1)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  aria-label={`少${verb}一${unit}`}
                >
                  <Minus size={16} />
                </button>
                <input
                  inputMode="numeric"
                  value={form.progress || ''}
                  onChange={(e) => setProgress(toInt(e.target.value))}
                  placeholder="0"
                  className={`${INPUT_BASE} w-20 text-center tabular-nums`}
                  aria-label={`已${verb}${unit}数`}
                />
                <button
                  type="button"
                  onClick={() => setProgress(form.progress + 1)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  aria-label={`多${verb}一${unit}`}
                >
                  <Plus size={16} />
                </button>
                <span className="px-1 text-slate-400">/</span>
                <input
                  inputMode="numeric"
                  value={form.totalEpisodes || ''}
                  onChange={(e) => {
                    const totalEpisodes = toInt(e.target.value);
                    // 只有一季时，总集数就是这一季的集数
                    update(
                      form.parts.length === 1
                        ? { totalEpisodes, parts: [{ ...form.parts[0], episodes: totalEpisodes }] }
                        : { totalEpisodes },
                    );
                  }}
                  placeholder="?"
                  className={`${INPUT_BASE} w-20 text-center tabular-nums`}
                  aria-label={`总${unit}数`}
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">{unit}</span>
              </div>
              {form.totalEpisodes > 0 && form.progress > form.totalEpisodes && (
                <p className="mt-1 text-xs text-amber-600">
                  已{verb}{unit}数超过了总{unit}数，保存时会按总{unit}数计。
                </p>
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
            <Field label={`${labels.air}日期`}>
              <input type="date" value={form.airDate} onChange={(e) => update({ airDate: e.target.value })} className={INPUT} />
            </Field>
            <Field label={labels.start}>
              <input type="date" value={form.startedAt} onChange={(e) => update({ startedAt: e.target.value })} className={INPUT} />
            </Field>
            <Field label={labels.finish}>
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
              placeholder={`${labels.finish}的感想、喜欢的角色、印象深的片段……`}
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
