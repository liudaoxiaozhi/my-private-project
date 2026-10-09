"use client";
// components/admin/ConfigSections.tsx —— 弹幕、外观、站点设置（都是 siteConfig 里的项）
//
// 后台只保存「改过的项」（siteConfig.overrides.json），siteConfig.ts 里的是默认值；改过的项旁边有「恢复默认」。
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, usedAttachments } from '../../lib/admin/client';
import type { SaveResult, StagedFile } from '../../lib/admin/client';
import { Button, Field, Grid, ImageField, ImageList, Loading, Panel, Row, SaveBar, Select, TextArea, TextInput, Toggle, useAdmin } from './ui';

type Values = Record<string, unknown>;

interface ConfigView {
  defaults: Values;
  overrides: Values;
  values: Values;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function getIn(obj: Values, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Values)[k] : undefined), obj);
}

function setIn(obj: Values, path: string, value: unknown): Values {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...obj, [head]: value };
  return { ...obj, [head]: setIn((obj[head] as Values) ?? {}, rest.join('.'), value) };
}

export interface FormApi {
  str: (path: string) => string;
  bool: (path: string) => boolean;
  list: (path: string) => string[];
  set: (path: string, value: unknown) => void;
  staged: StagedFile[];
  addStaged: (f: StagedFile) => void;
  /** 这一项改过（和默认值不同）时显示的「恢复默认」按钮 */
  reset: (key: string) => ReactNode;
}

/** 管理 siteConfig 里的一组键：读取、编辑、保存改动的键、恢复默认 */
function ConfigForm({ keys, title, subtitle, children }: { keys: string[]; title: string; subtitle?: ReactNode; children: (f: FormApi) => ReactNode }) {
  const [view, setView] = useState<ConfigView | null>(null);
  const [draft, setDraft] = useState<Values>({});
  const [resets, setResets] = useState<string[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast, saved } = useAdmin();
  const keysKey = keys.join(',');

  const adopt = useCallback(
    (v: ConfigView) => {
      setView(v);
      setDraft(clone(Object.fromEntries(keysKey.split(',').map((k) => [k, v.values[k]]))));
      setResets([]);
    },
    [keysKey],
  );

  useEffect(() => {
    api<ConfigView>('/api/admin/config')
      .then(adopt)
      .catch((e) => toast(e instanceof Error ? e.message : '加载失败', 'error'));
  }, [adopt, toast]);

  if (!view) return <Panel title={title}><Loading /></Panel>;

  const changed = keys.filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(view.values[k]));
  const dirty = changed.length > 0 || resets.length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const patch: Values = {};
      for (const k of resets) patch[k] = null;
      for (const k of changed) patch[k] = draft[k];
      const res = await api<SaveResult & ConfigView>('/api/admin/config', {
        method: 'PUT',
        body: { patch, attachments: usedAttachments(staged, patch) },
      });
      adopt(res);
      saved(res, '设置已保存');
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const f: FormApi = {
    str: (p) => {
      const v = getIn(draft, p);
      return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
    },
    bool: (p) => getIn(draft, p) === true,
    list: (p) => {
      const v = getIn(draft, p);
      return Array.isArray(v) ? v.map(String) : [];
    },
    set: (p, value) => {
      setDraft((d) => setIn(d, p, value));
      setResets((r) => r.filter((k) => k !== p.split('.')[0]));
    },
    staged,
    addStaged: (file) => setStaged((s) => [...s, file]),
    reset: (key) =>
      key in view.overrides && !resets.includes(key) ? (
        <button
          type="button"
          className="text-[11px] font-bold text-amber-300 hover:text-amber-200"
          onClick={() => {
            setDraft((d) => ({ ...d, [key]: clone(view.defaults[key]) }));
            setResets((r) => [...r, key]);
          }}
        >
          恢复默认
        </button>
      ) : null,
  };

  return (
    <Panel title={title} subtitle={subtitle}>
      <div className="flex flex-col gap-6">{children(f)}</div>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={() => adopt(view)} />
    </Panel>
  );
}

function Group({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-black tracking-wide text-indigo-200">{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}

const num = (s: string): number | string => (s.trim() !== '' && !Number.isNaN(Number(s)) ? Number(s) : s);

// —— 弹幕 ——

export function DanmakuSection() {
  const [draftLine, setDraftLine] = useState('');
  return (
    <ConfigForm keys={['enableDanmaku', 'danmakuList']} title="弹幕" subtitle="首页开场一屏飘过的弹幕；另外会自动加上最近几篇文章的标题">
      {(f) => {
        const list = f.list('danmakuList');
        const add = () => {
          const lines = draftLine.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length) f.set('danmakuList', [...list, ...lines]);
          setDraftLine('');
        };
        return (
          <>
            <Toggle checked={f.bool('enableDanmaku')} onChange={(v) => f.set('enableDanmaku', v)} label="显示弹幕" hint="关掉后首页开场不飘弹幕" />
            <Group title={`弹幕列表（${list.length} 条）`} extra={f.reset('danmakuList')}>
              <div className="flex gap-2">
                <TextInput value={draftLine} onChange={setDraftLine} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="输入一条弹幕，回车添加" />
                <Button tone="primary" size="md" onClick={add}>添加</Button>
              </div>
              <div className="flex flex-col gap-2">
                {list.map((line, i) => (
                  <Row key={`${line}-${i}`} className="py-2">
                    <input
                      value={line}
                      onChange={(e) => f.set('danmakuList', list.map((l, j) => (j === i ? e.target.value : l)))}
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 focus:outline-none"
                      aria-label={`第 ${i + 1} 条弹幕`}
                    />
                    <Button tone="rose" onClick={() => f.set('danmakuList', list.filter((_, j) => j !== i))}>删除</Button>
                  </Row>
                ))}
              </div>
            </Group>
          </>
        );
      }}
    </ConfigForm>
  );
}

// —— 外观 ——

export function AppearanceSection() {
  return (
    <ConfigForm
      keys={['bgImages', 'bgImagesMobile', 'bgBlur', 'bgMode', 'useGradient', 'themeColors', 'labStyle', 'vinylPlayer', 'homeHero', 'defaultPostCover', 'defaultChatterCover', 'photoWallImage', 'enableSakura', 'enableParticles', 'enableClickEffect', 'enablePet', 'enableSeasonal']}
      title="外观"
      subtitle="背景、风格、首页开场和各种特效"
    >
      {(f) => (
        <>
          <Group title="背景插画（电脑）" extra={f.reset('bgImages')}>
            <ImageList value={f.list('bgImages')} onChange={(v) => f.set('bgImages', v)} staged={f.staged} onStaged={f.addStaged} />
            <p className="admin-hint text-[11px]">多张会轮播，每张停 10 秒；横图，宽度 2000 像素以上最清楚</p>
          </Group>
          <Group title="背景插画（手机）" extra={f.reset('bgImagesMobile')}>
            <ImageList value={f.list('bgImagesMobile')} onChange={(v) => f.set('bgImagesMobile', v)} staged={f.staged} onStaged={f.addStaged} />
            <p className="admin-hint text-[11px]">竖图；留空就用电脑的</p>
          </Group>
          <Grid>
            <Field label="背景模糊" hint={f.reset('bgBlur')}>
              <Select value={f.str('bgBlur') || 'light'} onChange={(v) => f.set('bgBlur', v)} options={[{ value: 'none', label: '不模糊（插画原样）' }, { value: 'light', label: '轻微模糊（推荐）' }, { value: 'strong', label: '较重模糊' }]} />
            </Field>
            <Field label="背景模式" hint={f.reset('bgMode') ?? '漫画风：去色、提亮、线稿清晰，适合黑白漫画分镜图'}>
              <Select value={f.str('bgMode') || 'illustration'} onChange={(v) => f.set('bgMode', v)} options={[{ value: 'illustration', label: '插画原样' }, { value: 'manga', label: '漫画风' }]} />
            </Field>
          </Grid>
          <Group title="风格">
            <Toggle checked={f.bool('labStyle')} onChange={(v) => f.set('labStyle', v)} label="「实验室」风格" hint="卡片更白更轻、细粉边，小标签换成等宽大写字" />
            <Toggle checked={f.bool('vinylPlayer')} onChange={(v) => f.set('vinylPlayer', v)} label="黑胶唱片播放器" hint="首页播放器显示成旋转的黑胶唱片" />
            <Toggle checked={f.bool('useGradient')} onChange={(v) => f.set('useGradient', v)} label="用渐变色代替背景插画" />
            {f.bool('useGradient') && (
              <Field label="渐变色（逗号分隔）" hint={f.reset('themeColors')}>
                <TextInput value={f.list('themeColors').join(', ')} onChange={(v) => f.set('themeColors', v.split(/[,，]/).map((c) => c.trim()).filter(Boolean))} placeholder="#a18cd1, #fbc2eb" />
              </Field>
            )}
          </Group>
          <Group title="首页开场" extra={f.reset('homeHero')}>
            <Toggle checked={f.bool('homeHero.enabled')} onChange={(v) => f.set('homeHero.enabled', v)} label="显示开场" hint="一屏高的渐变大标题 + 终端打字效果" />
            <Grid>
              <Field label="大标题"><TextInput value={f.str('homeHero.title')} onChange={(v) => f.set('homeHero.title', v)} /></Field>
              <Field label="终端提示符"><TextInput value={f.str('homeHero.prompt')} onChange={(v) => f.set('homeHero.prompt', v)} /></Field>
              <Field label="打出来的命令"><TextInput value={f.str('homeHero.command')} onChange={(v) => f.set('homeHero.command', v)} /></Field>
              <Field label="回车后输出的一行"><TextInput value={f.str('homeHero.output')} onChange={(v) => f.set('homeHero.output', v)} /></Field>
              <Field label="「往下滚」提示"><TextInput value={f.str('homeHero.scrollPrompt')} onChange={(v) => f.set('homeHero.scrollPrompt', v)} /></Field>
            </Grid>
          </Group>
          <Group title="默认图片">
            <Field group label="文章默认封面" hint={f.reset('defaultPostCover')}>
              <ImageField value={f.str('defaultPostCover')} onChange={(v) => f.set('defaultPostCover', v)} staged={f.staged} onStaged={f.addStaged} />
            </Field>
            <Field group label="杂谈默认封面" hint={f.reset('defaultChatterCover')}>
              <ImageField value={f.str('defaultChatterCover')} onChange={(v) => f.set('defaultChatterCover', v)} staged={f.staged} onStaged={f.addStaged} />
            </Field>
            <Field group label="首页照片墙预览图" hint={f.reset('photoWallImage')}>
              <ImageField value={f.str('photoWallImage')} onChange={(v) => f.set('photoWallImage', v)} staged={f.staged} onStaged={f.addStaged} />
            </Field>
          </Group>
          <Group title="特效">
            <Toggle checked={f.bool('enableSakura')} onChange={(v) => f.set('enableSakura', v)} label="樱花飘落" hint="全站樱花，夜间更淡；背景的樱花枝也跟着这个开关" />
            <Toggle checked={f.bool('enableParticles')} onChange={(v) => f.set('enableParticles', v)} label="底部草地" hint="只在电脑端、「完整」档显示" />
            <Toggle checked={f.bool('enableClickEffect')} onChange={(v) => f.set('enableClickEffect', v)} label="点击涟漪" />
            <Toggle checked={f.bool('enablePet')} onChange={(v) => f.set('enablePet', v)} label="桌宠" hint="右下角的 Q 版骑士少女（台子兼做迷你播放器）" />
            <Toggle checked={f.bool('enableSeasonal')} onChange={(v) => f.set('enableSeasonal', v)} label="节日彩蛋" hint="圣诞元旦下雪、春节红梅、生日彩纸" />
          </Group>
        </>
      )}
    </ConfigForm>
  );
}

// —— 站点设置 ——

export function SettingsSection() {
  return (
    <ConfigForm
      keys={['title', 'authorName', 'bio', 'navTitle', 'navSuffix', 'navAfter', 'avatarUrl', 'faviconUrl', 'social', 'chatterTitle', 'chatterDescription', 'buildDate', 'timeZone', 'timeZoneLabel', 'weather', 'birthday', 'icpConfig', 'friendLinkApplyFormat']}
      title="站点设置"
      subtitle="名字、头像、导航栏、社交链接、时区与天气等"
    >
      {(f) => (
        <>
          <Group title="基本信息">
            <Grid>
              <Field label="网站标题" hint={f.reset('title')}><TextInput value={f.str('title')} onChange={(v) => f.set('title', v)} /></Field>
              <Field label="名字" hint={f.reset('authorName')}><TextInput value={f.str('authorName')} onChange={(v) => f.set('authorName', v)} /></Field>
              <Field label="一句话简介" wide hint={f.reset('bio')}><TextInput value={f.str('bio')} onChange={(v) => f.set('bio', v)} /></Field>
              <Field group label="头像" hint={f.reset('avatarUrl')}>
                <ImageField square value={f.str('avatarUrl')} onChange={(v) => f.set('avatarUrl', v)} staged={f.staged} onStaged={f.addStaged} />
              </Field>
              <Field group label="网站图标（favicon）" hint={f.reset('faviconUrl')}>
                <ImageField square value={f.str('faviconUrl')} onChange={(v) => f.set('faviconUrl', v)} staged={f.staged} onStaged={f.addStaged} />
              </Field>
            </Grid>
          </Group>
          <Group title="导航栏的站名" extra={<span className="admin-hint text-[11px]">显示为「{f.str('navTitle')} {f.str('navSuffix')} {f.str('navAfter')}」</span>}>
            <Grid>
              <Field label="前半" hint={f.reset('navTitle')}><TextInput value={f.str('navTitle')} onChange={(v) => f.set('navTitle', v)} /></Field>
              <Field label="中间（彩色）" hint={f.reset('navSuffix')}><TextInput value={f.str('navSuffix')} onChange={(v) => f.set('navSuffix', v)} /></Field>
              <Field label="后半" hint={f.reset('navAfter')}><TextInput value={f.str('navAfter')} onChange={(v) => f.set('navAfter', v)} /></Field>
            </Grid>
          </Group>
          <Group title="社交链接" extra={f.reset('social')}>
            <Grid>
              {[
                ['email', '邮箱'],
                ['github', 'GitHub'],
                ['gitee', 'Gitee'],
                ['google', 'Google'],
                ['instagram', 'Instagram'],
                ['qq', 'QQ'],
                ['wechat', '微信'],
              ].map(([key, label]) => (
                <Field key={key} label={label}><TextInput value={f.str(`social.${key}`)} onChange={(v) => f.set(`social.${key}`, v)} placeholder="留空不显示" /></Field>
              ))}
            </Grid>
          </Group>
          <Group title="杂谈页">
            <Grid>
              <Field label="标题" hint={f.reset('chatterTitle')}><TextInput value={f.str('chatterTitle')} onChange={(v) => f.set('chatterTitle', v)} /></Field>
              <Field label="副标题" hint={f.reset('chatterDescription')}><TextInput value={f.str('chatterDescription')} onChange={(v) => f.set('chatterDescription', v)} /></Field>
            </Grid>
          </Group>
          <Group title="时间与天气" extra={f.reset('weather')}>
            <Grid>
              <Field label="时区" hint={f.reset('timeZone') ?? 'IANA 时区名，如 Asia/Singapore、Asia/Shanghai'}><TextInput value={f.str('timeZone')} onChange={(v) => f.set('timeZone', v)} /></Field>
              <Field label="时钟下方的地名" hint={f.reset('timeZoneLabel')}><TextInput value={f.str('timeZoneLabel')} onChange={(v) => f.set('timeZoneLabel', v)} /></Field>
              <Field label="建站日期" hint={f.reset('buildDate')}><TextInput value={f.str('buildDate')} onChange={(v) => f.set('buildDate', v)} placeholder="2026-03-23T00:00:00" /></Field>
              <Field label="生日（月-日）" hint={f.reset('birthday') ?? '当天全站撒彩纸，桌宠送祝福；留空不启用'}><TextInput value={f.str('birthday')} onChange={(v) => f.set('birthday', v)} placeholder="05-20" /></Field>
            </Grid>
            <Toggle checked={f.bool('weather.enabled')} onChange={(v) => f.set('weather.enabled', v)} label="显示天气" hint="首页时间栏显示天气，背景跟着下雨、起雾" />
            <Grid>
              <Field label="城市名"><TextInput value={f.str('weather.city')} onChange={(v) => f.set('weather.city', v)} /></Field>
              <Field label="新加坡区域名" hint="如 City、Bedok；不是新加坡就留空"><TextInput value={f.str('weather.area')} onChange={(v) => f.set('weather.area', v)} /></Field>
              <Field label="纬度"><TextInput value={f.str('weather.latitude')} onChange={(v) => f.set('weather.latitude', num(v))} /></Field>
              <Field label="经度"><TextInput value={f.str('weather.longitude')} onChange={(v) => f.set('weather.longitude', num(v))} /></Field>
            </Grid>
          </Group>
          <Group title="其他">
            <Field label="友链申请格式" hint={f.reset('friendLinkApplyFormat') ?? '可用 {{name}} {{bio}} {{siteUrl}} {{avatar}}'}>
              <TextArea value={f.str('friendLinkApplyFormat')} onChange={(v) => f.set('friendLinkApplyFormat', v)} rows={4} />
            </Field>
            <Grid>
              <Field label="备案号" hint={f.reset('icpConfig')}><TextInput value={f.str('icpConfig.name')} onChange={(v) => f.set('icpConfig.name', v)} placeholder="没有就留空" /></Field>
              <Field label="备案链接"><TextInput value={f.str('icpConfig.link')} onChange={(v) => f.set('icpConfig.link', v)} /></Field>
            </Grid>
          </Group>
        </>
      )}
    </ConfigForm>
  );
}
