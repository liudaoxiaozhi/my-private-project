"use client";
// components/admin/ui.tsx —— 网页后台的基础组件：面板、按钮、输入框、开关、图片选择、提示条
//
// 后台固定用深色毛玻璃（和网站的日夜主题无关），背景沿用网站的背景插画。
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, previewUrl, uploadImage } from '../../lib/admin/client';
import type { SaveResult, StagedFile } from '../../lib/admin/client';

// —— 全局：提示条、保存后的部署状态 ——

export interface AdminContextValue {
  toast: (message: string, tone?: 'ok' | 'error' | 'info') => void;
  /** 保存成功后调用：提示 + 跟踪这次提交的部署进度 */
  saved: (result: SaveResult, what?: string) => void;
  /** 本地模式（直接写磁盘）还是 GitHub */
  storageKind: 'github' | 'local' | 'none';
}

export const AdminContext = createContext<AdminContextValue>({ toast: () => {}, saved: () => {}, storageKind: 'none' });
export const useAdmin = () => useContext(AdminContext);

/**
 * 读取一个接口：打开时读一次，调用返回的 reload() 再读一次。拿到数据交给 onData，出错时弹提示并交给 onError
 */
export function useLoader<T>(url: string, onData: (data: T) => void, onError?: () => void): () => void {
  const [version, setVersion] = useState(0);
  const { toast } = useAdmin();
  const handle = useEffectEvent((data: T) => onData(data));
  const fail = useEffectEvent((e: unknown) => {
    toast(e instanceof Error ? e.message : '加载失败', 'error');
    onError?.();
  });
  useEffect(() => {
    let alive = true;
    api<T>(url)
      .then((data) => alive && handle(data))
      .catch((e: unknown) => alive && fail(e));
    return () => {
      alive = false;
    };
  }, [url, version]);
  return () => setVersion((v) => v + 1);
}

// —— 布局 ——

export function Panel({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="admin-panel p-5 sm:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-white sm:text-2xl">{title}</h2>
          {subtitle && <p className="admin-hint mt-1.5 text-xs sm:text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`admin-row flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 ${className}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="admin-row px-5 py-8 text-center text-sm text-slate-400">{children}</p>;
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-slate-400">加载中…</p>;
}

// —— 按钮 ——

type Tone = 'primary' | 'amber' | 'rose' | 'indigo' | 'ghost';
const TONE: Record<Tone, string> = {
  primary: 'bg-indigo-500 text-white shadow-[0_8px_24px_-8px] shadow-indigo-500/70 hover:bg-indigo-400',
  amber: 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25',
  rose: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
  indigo: 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30',
  ghost: 'bg-white/5 text-slate-200 hover:bg-white/10',
};

export function Button({
  tone = 'ghost',
  size = 'sm',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size === 'md' ? 'px-5 py-2.5 text-sm' : 'px-3 py-1.5 text-xs'} ${TONE[tone]} ${className}`}
    />
  );
}

/** 要点两下才执行（删除等危险操作） */
export function ConfirmButton({ onConfirm, children, label = '确定删除？', disabled }: { onConfirm: () => void; children: ReactNode; label?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  return (
    <Button
      tone="rose"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          window.clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? label : children}
    </Button>
  );
}

// —— 表单 ——

/**
 * 表单项。里面是单个输入框时用 <label> 包起来（点标题就能聚焦、读屏也读得到名字）；
 * 里面是编辑器、图片选择这种带按钮的复杂控件时传 group，改用 role="group"，免得按钮文字混进标签里
 */
export function Field({ label, hint, children, wide, group }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean; group?: boolean }) {
  const className = `flex min-w-0 flex-col gap-1.5 ${wide ? 'sm:col-span-2' : ''}`;
  const body = (
    <>
      <span className="text-xs font-bold tracking-wide text-slate-300">{label}</span>
      {children}
      {hint && <span className="admin-hint text-[11px] leading-relaxed">{hint}</span>}
    </>
  );
  return group ? (
    <div role="group" aria-label={label} className={className}>
      {body}
    </div>
  ) : (
    <label className={className}>{body}</label>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export const inputClass =
  'admin-input w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/70';

export function TextInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  return <input {...props} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea({ value, onChange, rows = 4, ...props }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  return <textarea {...props} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} resize-y leading-relaxed ${props.className ?? ''}`} />;
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputClass}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-slate-800">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="admin-row flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-100">{label}</span>
        {hint && <span className="admin-hint mt-0.5 block text-[11px] leading-relaxed">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/** 逗号 / 回车分隔的标签 */
export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = draft.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft('');
  };
  return (
    <div className={`${inputClass} flex flex-wrap items-center gap-1.5 py-2`}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-100">
          {tag}
          <button type="button" aria-label={`删除标签 ${tag}`} className="text-indigo-300 hover:text-white" onClick={() => onChange(value.filter((t) => t !== tag))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[6rem] flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
      />
    </div>
  );
}

// —— 图片 ——

/**
 * 图片：可以直接填地址（/images/... 或 https://...），也可以上传（压成 WebP，保存时一起提交）。
 * staged：这个页面里所有暂存的附件，上传后加进去，预览时用它显示还没部署的图
 */
export function ImageField({
  value,
  onChange,
  staged,
  onStaged,
  placeholder = '/images/... 或 https://...',
  square,
}: {
  value: string;
  onChange: (v: string) => void;
  staged: StagedFile[];
  onStaged: (f: StagedFile) => void;
  placeholder?: string;
  square?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useAdmin();
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const f = await uploadImage(file);
      onStaged(f);
      onChange(f.url);
    } catch (e) {
      toast(e instanceof Error ? e.message : '上传失败', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      <div className={`admin-input relative shrink-0 overflow-hidden rounded-xl ${square ? 'h-14 w-14' : 'h-14 w-24'}`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl(value, staged)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-[10px] text-slate-500">无</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputClass} py-2 text-xs`} />
        <div className="flex gap-2">
          <Button tone="indigo" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? '上传中…' : '上传图片'}
          </Button>
          {value && (
            <Button tone="ghost" onClick={() => onChange('')}>
              清空
            </Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

/** 多张图片（说说配图、背景图列表、相册照片） */
export function ImageList({
  value,
  onChange,
  staged,
  onStaged,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  staged: StagedFile[];
  onStaged: (f: StagedFile) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [draft, setDraft] = useState('');
  const { toast } = useAdmin();
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setBusy(list.length);
    const urls: string[] = [];
    for (const file of list) {
      try {
        const f = await uploadImage(file);
        onStaged(f);
        urls.push(f.url);
      } catch (e) {
        toast(`${file.name}：${e instanceof Error ? e.message : '上传失败'}`, 'error');
      }
      setBusy((n) => n - 1);
    }
    onChange([...value, ...urls]);
  };
  const move = (i: number, d: number) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {value.map((url, i) => (
            <div key={`${url}-${i}`} className="admin-input group relative aspect-square overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl(url, staged)} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 p-1 text-xs text-white opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="前移" className="px-1 disabled:opacity-30">‹</button>
                <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="移除" className="px-1 text-rose-300">移除</button>
                <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="后移" className="px-1 disabled:opacity-30">›</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button tone="indigo" disabled={busy > 0} onClick={() => input.current?.click()}>
          {busy > 0 ? `上传中…（剩 ${busy} 张）` : '上传图片（可多选）'}
        </Button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              onChange([...value, draft.trim()]);
              setDraft('');
            }
          }}
          placeholder="或者填图片地址，回车添加"
          className={`${inputClass} min-w-[12rem] flex-1 py-1.5 text-xs`}
        />
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

/** 底部的保存条：有改动时出现 */
export function SaveBar({ dirty, saving, onSave, onReset, note }: { dirty: boolean; saving: boolean; onSave: () => void; onReset?: () => void; note?: string }) {
  return (
    <div className="sticky bottom-3 z-10 mt-6 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur-md">
      <span className="admin-hint mr-auto text-xs">{saving ? '正在保存…' : dirty ? (note ?? '有未保存的修改') : '没有未保存的修改'}</span>
      {onReset && dirty && (
        <Button tone="ghost" onClick={onReset} disabled={saving}>
          撤销修改
        </Button>
      )}
      <Button tone="primary" size="md" onClick={onSave} disabled={!dirty || saving}>
        {saving ? '保存中…' : '保存'}
      </Button>
    </div>
  );
}
