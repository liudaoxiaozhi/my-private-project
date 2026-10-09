"use client";
// components/admin/ContentSection.tsx —— 文章 / 杂谈 / 说说 / 关于我：列表 + 编辑
import { useEffect, useState } from 'react';
import { api, nowStamp, usedAttachments } from '../../lib/admin/client';
import type { SaveResult, StagedFile } from '../../lib/admin/client';
import MarkdownEditor from './MarkdownEditor';
import { Button, ConfirmButton, Empty, Field, Grid, ImageField, ImageList, Loading, Panel, Row, SaveBar, TagInput, TextArea, TextInput, useAdmin, useLoader } from './ui';

export type ContentKind = 'posts' | 'chatters' | 'moments' | 'about';

interface Summary {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  cover: string;
}

interface Doc {
  slug: string;
  data: Record<string, unknown>;
  body: string;
}

const LABEL: Record<ContentKind, string> = { posts: '文章', chatters: '杂谈', moments: '说说', about: '关于我' };
/** 网站上对应的页面（编辑后可以点过去看） */
const PAGE: Record<ContentKind, (slug: string) => string> = {
  posts: (s) => `/posts/${encodeURIComponent(s)}`,
  chatters: (s) => `/chatter/${encodeURIComponent(s)}`,
  moments: () => '/moments',
  about: () => '/about',
};

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** 新文章的文件名：从标题来，去掉不能用的字符 */
function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export default function ContentSection({ kind }: { kind: ContentKind }) {
  const [items, setItems] = useState<Summary[] | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(kind === 'about' ? 'about' : null);
  const [query, setQuery] = useState('');
  const { toast, saved } = useAdmin();

  const load = useLoader<{ items: Summary[] }>(`/api/admin/content/${kind}`, (d) => setItems(d.items), () => setItems([]));

  if (editing !== null) {
    return (
      <Editor
        kind={kind}
        slug={editing === 'new' ? null : editing}
        onClose={
          kind === 'about'
            ? undefined
            : () => {
                setEditing(null);
                load();
              }
        }
      />
    );
  }

  const remove = async (slug: string) => {
    try {
      const res = await api<SaveResult>(`/api/admin/content/${kind}/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      saved(res, '已删除');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : '删除失败', 'error');
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => !q || `${i.title} ${i.slug} ${i.excerpt} ${i.tags.join(' ')}`.toLowerCase().includes(q));

  return (
    <Panel
      title={`${LABEL[kind]}管理`}
      subtitle={items ? `共 ${items.length} ${kind === 'moments' ? '条' : '篇'} · 新的在前 · 保存后网站约 1~2 分钟更新` : undefined}
      actions={<Button tone="primary" size="md" onClick={() => setEditing('new')}>{kind === 'moments' ? '发说说' : `写${LABEL[kind]}`}</Button>}
    >
      {items === null ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-3">
          {items.length > 4 && <TextInput value={query} onChange={setQuery} placeholder="搜索标题、内容、标签…" />}
          {shown.length === 0 && <Empty>{items.length ? '没有匹配的' : `还没有${LABEL[kind]}，点右上角写第一篇吧`}</Empty>}
          {shown.map((item) => (
            <Row key={item.slug}>
              <button type="button" className="min-w-[12rem] flex-1 text-left" onClick={() => setEditing(item.slug)}>
                <span className="block truncate text-sm font-bold text-white">{item.title || item.excerpt || item.slug}</span>
                <span className="admin-hint mt-0.5 block truncate font-lab text-[11px]">
                  {item.date || '无日期'}
                  {kind !== 'moments' && ` · ${item.slug}`}
                  {item.tags.length > 0 && ` · ${item.tags.join(' / ')}`}
                </span>
              </button>
              <a href={PAGE[kind](item.slug)} target="_blank" rel="noreferrer" className="rounded-xl bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10">
                查看
              </a>
              <Button tone="indigo" onClick={() => setEditing(item.slug)}>编辑</Button>
              <ConfirmButton onConfirm={() => void remove(item.slug)}>删除</ConfirmButton>
            </Row>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Editor({ kind, slug, onClose }: { kind: ContentKind; slug: string | null; onClose?: () => void }) {
  const isNew = slug === null;
  const [original, setOriginal] = useState<Doc | null>(isNew ? { slug: '', data: { date: nowStamp() }, body: '' } : null);
  const [doc, setDoc] = useState<Doc | null>(original);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast, saved } = useAdmin();

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    api<Doc>(`/api/admin/content/${kind}/${encodeURIComponent(slug!)}`)
      .then((d) => {
        if (!alive) return;
        setOriginal(d);
        setDoc(d);
      })
      .catch((e) => toast(e instanceof Error ? e.message : '加载失败', 'error'));
    return () => {
      alive = false;
    };
  }, [isNew, kind, slug, toast]);

  if (!doc || !original) return <Panel title={`编辑${LABEL[kind]}`}><Loading /></Panel>;

  const set = (key: string, value: unknown) => setDoc((d) => (d ? { ...d, data: { ...d.data, [key]: value } } : d));
  const setTitle = (title: string) =>
    setDoc((d) => (d ? { ...d, data: { ...d.data, title }, slug: slugTouched ? d.slug : slugFromTitle(title) } : d));
  const addStaged = (f: StagedFile) => setStaged((s) => [...s, f]);
  const dirty = JSON.stringify(doc) !== JSON.stringify(original);

  const save = async () => {
    // 说说没有标题：文件名用时间
    const fileSlug = kind === 'moments' && isNew ? str(doc.data.date).replace(/[^\d]/g, '').slice(0, 14) || String(Date.now()) : doc.slug;
    if (kind !== 'moments' && kind !== 'about' && !str(doc.data.title).trim()) return toast('请填写标题', 'error');
    if (kind !== 'about' && !fileSlug.trim()) return toast('请填写文件名', 'error');
    if (kind === 'moments' && !doc.body.trim()) return toast('说点什么吧', 'error');
    setSaving(true);
    try {
      const res = await api<SaveResult & { slug: string }>(`/api/admin/content/${kind}`, {
        method: 'POST',
        body: {
          slug: fileSlug,
          originalSlug: isNew ? undefined : original.slug,
          data: doc.data,
          body: doc.body,
          attachments: usedAttachments(staged, doc.data, doc.body),
        },
      });
      saved(res, isNew ? '已发布' : '已保存');
      const next = { ...doc, slug: res.slug };
      setOriginal(next);
      setDoc(next);
      if (isNew && onClose) onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const back = onClose && (
    <Button
      tone="ghost"
      size="md"
      onClick={() => {
        if (dirty && !window.confirm('有没保存的修改，确定离开？')) return;
        onClose();
      }}
    >
      ← 返回列表
    </Button>
  );

  return (
    <Panel
      title={isNew ? (kind === 'moments' ? '发说说' : `写${LABEL[kind]}`) : kind === 'about' ? '关于我' : `编辑${LABEL[kind]}`}
      subtitle={kind === 'about' ? '「关于」页的正文' : isNew ? '保存后发布到网站' : `文件：${kind}/${original.slug}.md`}
      actions={
        <>
          {!isNew && (
            <a href={PAGE[kind](original.slug)} target="_blank" rel="noreferrer" className="rounded-xl bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/10">
              在网站上查看
            </a>
          )}
          {back}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {kind === 'moments' ? (
          <Grid>
            <Field label="时间"><TextInput value={str(doc.data.date)} onChange={(v) => set('date', v)} placeholder="2026-10-09 20:00:00" /></Field>
            <Field label="地点（可不填）"><TextInput value={str(doc.data.location)} onChange={(v) => set('location', v)} placeholder="新加坡" /></Field>
            <Field group label="配图" wide>
              <ImageList value={strs(doc.data.images)} onChange={(v) => set('images', v)} staged={staged} onStaged={addStaged} />
            </Field>
          </Grid>
        ) : (
          <Grid>
            <Field label="标题"><TextInput value={str(doc.data.title)} onChange={setTitle} placeholder="标题" /></Field>
            {kind !== 'about' && (
              <Field label="文件名（网址）" hint={`网址会是 ${PAGE[kind](doc.slug || 'xxx')}；改了以后旧网址会失效`}>
                <TextInput
                  value={doc.slug}
                  onChange={(v) => {
                    setSlugTouched(true);
                    setDoc((d) => (d ? { ...d, slug: v } : d));
                  }}
                  placeholder="my-first-post"
                />
              </Field>
            )}
            <Field label="日期"><TextInput value={str(doc.data.date)} onChange={(v) => set('date', v)} placeholder="2026-10-09 20:00:00" /></Field>
            {kind === 'chatters' && <Field label="心情（可不填）"><TextInput value={str(doc.data.mood)} onChange={(v) => set('mood', v)} placeholder="开心 / 摸鱼 / emo" /></Field>}
            {kind === 'posts' && <Field label="系列（可不填）" hint="同一系列的文章会互相链接"><TextInput value={str(doc.data.series)} onChange={(v) => set('series', v)} placeholder="博客使用指南" /></Field>}
            {kind !== 'about' && (
              <Field group label="标签">
                <TagInput value={strs(doc.data.tags)} onChange={(v) => set('tags', v)} placeholder="输入后回车或逗号" />
              </Field>
            )}
            <Field label="简介" wide hint={kind === 'chatters' ? '不填就用正文开头' : undefined}>
              <TextArea value={str(doc.data.description)} onChange={(v) => set('description', v)} rows={2} placeholder="一两句话的简介，显示在列表和卡片上" />
            </Field>
            <Field group label="封面" wide hint="不填用默认封面">
              <ImageField value={str(doc.data.cover)} onChange={(v) => set('cover', v)} staged={staged} onStaged={addStaged} />
            </Field>
          </Grid>
        )}
        <Field group label="正文">
          <MarkdownEditor value={doc.body} onChange={(body) => setDoc((d) => (d ? { ...d, body } : d))} staged={staged} onStaged={addStaged} rows={kind === 'moments' ? 6 : 20} />
        </Field>
      </div>
      <SaveBar dirty={dirty || isNew} saving={saving} onSave={() => void save()} onReset={isNew ? undefined : () => setDoc(original)} note={isNew ? '还没发布' : undefined} />
    </Panel>
  );
}
