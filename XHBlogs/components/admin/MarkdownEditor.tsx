"use client";
// components/admin/MarkdownEditor.tsx —— 后台的 Markdown 编辑器：工具栏、插图（上传后插入）、预览（和网站同一套渲染）
import { useRef, useState } from 'react';
import { api, previewUrl, uploadImage } from '../../lib/admin/client';
import type { StagedFile } from '../../lib/admin/client';
import { Button, inputClass, useAdmin } from './ui';

interface Props {
  value: string;
  onChange: (v: string) => void;
  staged: StagedFile[];
  onStaged: (f: StagedFile) => void;
  rows?: number;
  placeholder?: string;
}

/** 工具栏按钮：before / after 包住选中的文字；line 为 true 时加在行首 */
const TOOLS: { label: string; title: string; before: string; after?: string; line?: boolean }[] = [
  { label: 'B', title: '加粗', before: '**', after: '**' },
  { label: 'I', title: '斜体', before: '*', after: '*' },
  { label: 'H2', title: '二级标题', before: '## ', line: true },
  { label: 'H3', title: '三级标题', before: '### ', line: true },
  { label: '引用', title: '引用', before: '> ', line: true },
  { label: '列表', title: '列表', before: '- ', line: true },
  { label: '链接', title: '链接', before: '[', after: '](https://)' },
  { label: '代码', title: '代码块', before: '\n```\n', after: '\n```\n' },
  { label: '黑幕', title: '黑幕（鼠标移上去才显示）', before: '||', after: '||' },
];

export default function MarkdownEditor({ value, onChange, staged, onStaged, rows = 18, placeholder }: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [preview, setPreview] = useState<{ html: string; words: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useAdmin();

  const insert = (before: string, after = '', line = false) => {
    const el = area.current;
    if (!el) return onChange(value + before + after);
    const { selectionStart: start, selectionEnd: end } = el;
    let s = start;
    if (line) s = value.lastIndexOf('\n', start - 1) + 1;
    const selected = value.slice(start, end);
    const next = line ? value.slice(0, s) + before + value.slice(s) : value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = line ? end + before.length : start + before.length + selected.length;
      el.setSelectionRange(line ? start + before.length : start + before.length, cursor);
    });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of [...files]) {
        const staged = await uploadImage(f);
        onStaged(staged);
        insert(`\n![${f.name.replace(/\.[^.]+$/, '')}](${staged.url})\n`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '上传失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const showPreview = async () => {
    setTab('preview');
    setPreview(null);
    try {
      const res = await api<{ html: string; wordCount: number }>('/api/admin/preview', { method: 'POST', body: { markdown: value } });
      // 还没部署的图片换成浏览器里的预览地址
      let html = res.html;
      for (const f of staged) html = html.split(f.url).join(previewUrl(f.url, staged));
      setPreview({ html, words: res.wordCount });
    } catch (e) {
      setPreview({ html: `<p>预览失败：${e instanceof Error ? e.message : ''}</p>`, words: 0 });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button tone={tab === 'edit' ? 'indigo' : 'ghost'} onClick={() => setTab('edit')}>编辑</Button>
        <Button tone={tab === 'preview' ? 'indigo' : 'ghost'} onClick={() => void showPreview()}>预览</Button>
        {tab === 'edit' && (
          <>
            <span className="mx-1 h-5 w-px bg-white/10" />
            {TOOLS.map((t) => (
              <Button key={t.label} tone="ghost" title={t.title} onClick={() => insert(t.before, t.after, t.line)}>
                {t.label}
              </Button>
            ))}
            <Button tone="indigo" disabled={busy} onClick={() => file.current?.click()}>
              {busy ? '上传中…' : '插图'}
            </Button>
          </>
        )}
        <span className="admin-hint ml-auto text-[11px]">{value.length} 字符</span>
      </div>
      {tab === 'edit' ? (
        <textarea
          ref={area}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            // 直接粘贴截图
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void upload(e.clipboardData.files);
            }
          }}
          rows={rows}
          placeholder={placeholder ?? '支持 Markdown：代码块、提示框（> [!NOTE]）、黑幕 ||文字||、脚注、表格、公式……可以直接粘贴截图'}
          className={`${inputClass} resize-y font-mono text-[13px] leading-relaxed`}
        />
      ) : (
        <div className="admin-input dark min-h-[16rem] overflow-auto rounded-xl px-5 py-4">
          {preview ? (
            <>
              <p className="admin-hint mb-3 text-[11px]">约 {preview.words} 字 · 和网站上的效果一致（图片显示的是本地预览）</p>
              <div className="article-prose admin-prose" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </>
          ) : (
            <p className="text-sm text-slate-400">生成预览中…</p>
          )}
        </div>
      )}
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
