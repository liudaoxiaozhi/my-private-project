// lib/server/admin/settings.ts —— 后台的列表数据（照片墙 / 友链 / 项目）和站点设置（仅服务端）
//
// - 列表数据：data/*.json，整份读、整份写
// - 站点设置：siteConfig.ts 是带说明的默认值，后台只把「和默认值不一样的项」写进 siteConfig.overrides.json；
//   设回默认值的项会从 JSON 里去掉。只开放 EDITABLE 里的项，类型必须和默认值一致
import { AdminInputError } from './api';
import { attachmentChanges } from './content';
import type { Attachment } from './content';
import { getStorage } from './storage';
import { siteConfigDefaults } from '../../../siteConfig';

// —— 列表数据 ——

export type DataName = 'albums' | 'friends' | 'projects';
export const DATA_LABEL: Record<DataName, string> = { albums: '照片墙', friends: '友链', projects: '项目' };
export const isDataName = (v: string): v is DataName => v === 'albums' || v === 'friends' || v === 'projects';

const dataFile = (name: DataName): string => `data/${name}.json`;

export async function readData(name: DataName): Promise<unknown[]> {
  const raw = await getStorage().readText(dataFile(name));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 每一项都得是对象，字段都是字符串 / 字符串数组 / 对象数组（相册的照片）；id 不能重复 */
function validateItems(name: DataName, items: unknown): Record<string, unknown>[] {
  if (!Array.isArray(items)) throw new AdminInputError('数据格式不对');
  const ids = new Set<string>();
  return items.map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new AdminInputError(`第 ${i + 1} 项格式不对`);
    const record = item as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== 'string' || !id.trim()) throw new AdminInputError(`第 ${i + 1} 项缺少 id`);
    if (ids.has(id)) throw new AdminInputError(`id「${id}」重复了`);
    ids.add(id);
    if (name === 'albums' && !Array.isArray(record.photos)) throw new AdminInputError(`相册「${id}」缺少照片列表`);
    return record;
  });
}

export async function writeData(name: DataName, items: unknown, attachments?: Attachment[]): Promise<{ sha: string | null }> {
  const valid = validateItems(name, items);
  return getStorage().commit(
    [...attachmentChanges(attachments), { path: dataFile(name), content: `${JSON.stringify(valid, null, 2)}\n` }],
    `后台：更新${DATA_LABEL[name]}`,
  );
}

// —— 站点设置 ——

/** 后台可以改的设置项（其余的如评论密钥、开屏横幅仍然只在 siteConfig.ts 里改） */
export const EDITABLE = [
  'title', 'faviconUrl', 'authorName', 'bio', 'navTitle', 'navSuffix', 'navAfter', 'avatarUrl',
  'useGradient', 'themeColors', 'bgImages', 'bgImagesMobile', 'bgBlur', 'bgMode', 'labStyle', 'vinylPlayer', 'autoPlayMusic', 'homeHero',
  'defaultPostCover', 'defaultChatterCover', 'photoWallImage', 'social', 'chatterTitle', 'chatterDescription',
  'danmakuList', 'buildDate', 'timeZone', 'timeZoneLabel', 'weather', 'icpConfig', 'friendLinkApplyFormat', 'birthday',
  'enableParticles', 'enableSakura', 'enableDanmaku', 'enableClickEffect', 'enablePet', 'enableSeasonal',
] as const;
export type EditableKey = (typeof EDITABLE)[number];

const OVERRIDES_FILE = 'siteConfig.overrides.json';

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

function sameType(base: unknown, value: unknown): boolean {
  if (Array.isArray(base)) return Array.isArray(value);
  if (isPlain(base)) return isPlain(value) && Object.entries(value).every(([k, v]) => !(k in base) || sameType(base[k], v));
  return typeof base === typeof value;
}

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 只留下和默认值不一样的部分（对象逐项比较） */
function diff(base: unknown, value: unknown): unknown {
  if (isPlain(base) && isPlain(value)) {
    const out: Plain = {};
    for (const [k, v] of Object.entries(value)) {
      const d = k in base ? diff(base[k], v) : v;
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return deepEqual(base, value) ? undefined : value;
}

function mergeDeep(base: unknown, patch: unknown): unknown {
  if (!isPlain(base) || !isPlain(patch)) return patch === undefined ? base : patch;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = mergeDeep(base[k], v);
  return out;
}

const defaultsOf = (): Plain => {
  const all = siteConfigDefaults as unknown as Plain;
  return Object.fromEntries(EDITABLE.map((k) => [k, all[k]]));
};

export async function readOverrides(): Promise<Plain> {
  const raw = await getStorage().readText(OVERRIDES_FILE);
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return isPlain(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export interface ConfigView {
  defaults: Plain;
  overrides: Plain;
  /** 实际生效的值（默认值 + 后台的修改） */
  values: Plain;
}

export async function readConfig(): Promise<ConfigView> {
  const defaults = defaultsOf();
  const overrides = await readOverrides();
  const values = Object.fromEntries(EDITABLE.map((k) => [k, mergeDeep(defaults[k], overrides[k])]));
  return { defaults, overrides, values };
}

/**
 * patch：{ 键: 新值 }；值为 null 表示恢复默认
 * 返回保存后的设置；没有任何变化时不提交
 */
export async function saveConfig(patch: unknown, attachments?: Attachment[]): Promise<ConfigView & { sha: string | null }> {
  if (!isPlain(patch)) throw new AdminInputError('设置格式不对');
  const defaults = defaultsOf();
  const overrides = { ...(await readOverrides()) };
  for (const [key, value] of Object.entries(patch)) {
    if (!(EDITABLE as readonly string[]).includes(key)) throw new AdminInputError(`「${key}」不能在后台修改`);
    if (value === null) {
      delete overrides[key];
      continue;
    }
    if (!sameType(defaults[key], value)) throw new AdminInputError(`「${key}」的类型不对`);
    const d = diff(defaults[key], value);
    if (d === undefined) delete overrides[key];
    else overrides[key] = d;
  }
  // 其他（非 EDITABLE）键原样保留，避免误删手动加的内容
  const before = await getStorage().readText(OVERRIDES_FILE);
  const text = `${JSON.stringify(overrides, null, 2)}\n`;
  let sha: string | null = null;
  if (text !== before || (attachments?.length ?? 0) > 0) {
    ({ sha } = await getStorage().commit(
      [...attachmentChanges(attachments), { path: OVERRIDES_FILE, content: text }],
      `后台：修改站点设置（${Object.keys(patch).join('、')}）`,
    ));
  }
  const view = await readConfig();
  return { ...view, sha };
}

