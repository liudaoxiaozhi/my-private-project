"use client";
// components/admin/DataSections.tsx —— 照片墙 / 友链 / 项目（data/*.json），整份编辑、一起保存
import { useState } from 'react';
import type { ReactNode } from 'react';
import { api, nowStamp, usedAttachments } from '../../lib/admin/client';
import type { SaveResult, StagedFile } from '../../lib/admin/client';
import { Button, ConfirmButton, Empty, Field, Grid, ImageField, ImageList, Loading, Panel, SaveBar, TagInput, TextArea, TextInput, useAdmin, useLoader } from './ui';

type Item = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

interface ListApi {
  staged: StagedFile[];
  addStaged: (f: StagedFile) => void;
}

function ListEditor({
  name,
  title,
  subtitle,
  addLabel,
  blank,
  summary,
  render,
}: {
  name: 'albums' | 'friends' | 'projects';
  title: string;
  subtitle: string;
  addLabel: string;
  blank: () => Item;
  summary: (item: Item) => ReactNode;
  render: (item: Item, set: (key: string, value: unknown) => void, api: ListApi) => ReactNode;
}) {
  const [original, setOriginal] = useState<Item[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast, saved } = useAdmin();

  useLoader<{ items: Item[] }>(
    `/api/admin/data/${name}`,
    (d) => {
      setOriginal(d.items);
      setItems(d.items);
    },
    () => setOriginal([]),
  );

  if (original === null) return <Panel title={title}><Loading /></Panel>;

  const dirty = JSON.stringify(items) !== JSON.stringify(original);
  const update = (i: number, key: string, value: unknown) => setItems((list) => list.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  const move = (i: number, d: number) =>
    setItems((list) => {
      const next = [...list];
      const [it] = next.splice(i, 1);
      next.splice(i + d, 0, it);
      return next;
    });

  const save = async () => {
    for (const it of items) if (!str(it.id).trim()) return toast('有一项缺少 id', 'error');
    setSaving(true);
    try {
      const res = await api<SaveResult>(`/api/admin/data/${name}`, { method: 'PUT', body: { items, attachments: usedAttachments(staged, items) } });
      setOriginal(items);
      saved(res, '已保存');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const listApi: ListApi = { staged, addStaged: (f) => setStaged((s) => [...s, f]) };

  return (
    <Panel
      title={title}
      subtitle={`${subtitle} · 共 ${items.length} 项`}
      actions={
        <Button
          tone="primary"
          size="md"
          onClick={() => {
            const item = blank();
            setItems((list) => [item, ...list]);
            setOpen(str(item.id));
          }}
        >
          {addLabel}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {items.length === 0 && <Empty>还是空的，点右上角添加</Empty>}
        {items.map((item, i) => {
          const id = str(item.id);
          const expanded = open === id;
          return (
            <div key={`${id}-${i}`} className="admin-row">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <button type="button" className="min-w-[12rem] flex-1 text-left" onClick={() => setOpen(expanded ? null : id)}>
                  {summary(item)}
                </button>
                <div className="flex gap-1.5">
                  <Button tone="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移">↑</Button>
                  <Button tone="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="下移">↓</Button>
                  <Button tone="indigo" onClick={() => setOpen(expanded ? null : id)}>{expanded ? '收起' : '展开'}</Button>
                  <ConfirmButton label="确定移除？" onConfirm={() => setItems((list) => list.filter((_, j) => j !== i))}>移除</ConfirmButton>
                </div>
              </div>
              {expanded && <div className="border-t border-white/5 p-4 sm:p-5">{render(item, (k, v) => update(i, k, v), listApi)}</div>}
            </div>
          );
        })}
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={() => setItems(original)} note="有未保存的修改（移除、排序也要点保存）" />
    </Panel>
  );
}

function Summary({ image, title, sub }: { image?: string; title: string; sub: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {image !== undefined && (
        <span className="admin-input h-10 w-10 shrink-0 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <img src={image} alt="" className="h-full w-full object-cover" />}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-white">{title || '（未命名）'}</span>
        <span className="admin-hint block truncate text-[11px]">{sub}</span>
      </span>
    </span>
  );
}

// —— 照片墙 ——

interface Photo {
  url: string;
  caption?: string;
}

export function AlbumsSection() {
  return (
    <ListEditor
      name="albums"
      title="照片墙"
      subtitle="相册列表；第一个相册是首页照片墙卡片显示的那个"
      addLabel="新建相册"
      blank={() => ({ id: newId('album'), title: '新相册', description: '', cover: '', date: nowStamp().slice(0, 10), photos: [] })}
      summary={(a) => <Summary image={str(a.cover)} title={str(a.title)} sub={`${Array.isArray(a.photos) ? a.photos.length : 0} 张 · ${str(a.date)}`} />}
      render={(a, set, { staged, addStaged }) => {
        const photos = (Array.isArray(a.photos) ? a.photos : []) as Photo[];
        return (
          <div className="flex flex-col gap-4">
            <Grid>
              <Field label="相册名"><TextInput value={str(a.title)} onChange={(v) => set('title', v)} /></Field>
              <Field label="日期"><TextInput value={str(a.date)} onChange={(v) => set('date', v)} placeholder="2026-10-09" /></Field>
              <Field label="描述" wide><TextInput value={str(a.description)} onChange={(v) => set('description', v)} /></Field>
              <Field group label="封面" wide><ImageField value={str(a.cover)} onChange={(v) => set('cover', v)} staged={staged} onStaged={addStaged} /></Field>
            </Grid>
            <Field group label={`照片（${photos.length} 张）`}>
              <ImageList
                value={photos.map((p) => p.url)}
                onChange={(urls) => set('photos', urls.map((url) => photos.find((p) => p.url === url) ?? { url }))}
                staged={staged}
                onStaged={addStaged}
              />
            </Field>
            {photos.length > 0 && (
              <Field group label="照片说明（可不填）">
                <div className="flex flex-col gap-2">
                  {photos.map((p, i) => (
                    <div key={`${p.url}-${i}`} className="flex items-center gap-2">
                      <span className="admin-hint w-6 shrink-0 text-right font-lab text-[11px]">{i + 1}</span>
                      <TextInput value={p.caption ?? ''} onChange={(v) => set('photos', photos.map((q, j) => (j === i ? { ...q, caption: v || undefined } : q)))} placeholder="比如画师名" />
                    </div>
                  ))}
                </div>
              </Field>
            )}
          </div>
        );
      }}
    />
  );
}

// —— 友链 ——

export function FriendsSection() {
  return (
    <ListEditor
      name="friends"
      title="友链"
      subtitle="「友链」页的朋友们"
      addLabel="添加友链"
      blank={() => ({ id: newId('friend'), name: '', url: 'https://', description: '', avatar: '', themeColor: '#818cf8' })}
      summary={(f) => <Summary image={str(f.avatar)} title={str(f.name)} sub={str(f.url)} />}
      render={(f, set, { staged, addStaged }) => (
        <Grid>
          <Field label="名字"><TextInput value={str(f.name)} onChange={(v) => set('name', v)} /></Field>
          <Field label="网址"><TextInput value={str(f.url)} onChange={(v) => set('url', v)} /></Field>
          <Field label="简介" wide><TextInput value={str(f.description)} onChange={(v) => set('description', v)} /></Field>
          <Field group label="头像"><ImageField square value={str(f.avatar)} onChange={(v) => set('avatar', v)} staged={staged} onStaged={addStaged} /></Field>
          <Field group label="主题色" hint="卡片顶部的颜色">
            <div className="flex items-center gap-2">
              <input type="color" value={str(f.themeColor) || '#818cf8'} onChange={(e) => set('themeColor', e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg bg-transparent" aria-label="主题色" />
              <TextInput value={str(f.themeColor)} onChange={(v) => set('themeColor', v)} />
            </div>
          </Field>
        </Grid>
      )}
    />
  );
}

// —— 项目 ——

export function ProjectsSection() {
  return (
    <ListEditor
      name="projects"
      title="项目"
      subtitle="「项目」页展示的作品"
      addLabel="添加项目"
      blank={() => ({ id: newId('project'), name: '', description: '', icon: '🚀', githubUrl: 'https://github.com/', tags: [] })}
      summary={(p) => <Summary title={`${str(p.icon)} ${str(p.name)}`} sub={str(p.githubUrl)} />}
      render={(p, set) => (
        <Grid>
          <Field label="名字"><TextInput value={str(p.name)} onChange={(v) => set('name', v)} /></Field>
          <Field label="图标" hint="一个 emoji"><TextInput value={str(p.icon)} onChange={(v) => set('icon', v)} /></Field>
          <Field label="链接" wide><TextInput value={str(p.githubUrl)} onChange={(v) => set('githubUrl', v)} /></Field>
          <Field label="简介" wide><TextArea value={str(p.description)} onChange={(v) => set('description', v)} rows={2} /></Field>
          <Field group label="标签" wide><TagInput value={strs(p.tags)} onChange={(v) => set('tags', v)} placeholder="输入后回车" /></Field>
        </Grid>
      )}
    />
  );
}
