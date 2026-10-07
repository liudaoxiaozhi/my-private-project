"use client";
// components/novel/ReaderSettings.tsx —— 阅读器设置（小说阅读器与本地 EPUB 阅读器共用）
//
// - useReaderSettings：首帧用固定默认值（与服务端一致，避免 Hydration 不一致），挂载后读取本地设置；
//   首次阅读时跟随站点日夜模式
// - ReaderSettingsPanel：字号 / 行距 / 字体 / 底色面板

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../ThemeProvider';
import { FONT_SIZES, LINE_HEIGHTS, loadSettings, saveSettings } from '../../lib/novelProgress';
import type { ReaderFont, ReaderSettings, ReaderTheme } from '../../lib/novelProgress';

export const READER_THEMES: Array<{ id: ReaderTheme; label: string; swatch: string }> = [
  { id: 'paper', label: '白纸', swatch: '#f7f5ef' },
  { id: 'sepia', label: '羊皮纸', swatch: '#f1e7d0' },
  { id: 'green', label: '护眼', swatch: '#e2ead6' },
  { id: 'night', label: '夜间', swatch: '#141518' },
];

const FONTS: Array<{ id: ReaderFont; label: string }> = [
  { id: 'serif', label: '宋体' },
  { id: 'sans', label: '黑体' },
];

const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 18, lineHeight: 1.9, font: 'serif', theme: 'paper' };

function nearest<T extends number>(list: readonly T[], value: unknown, fallback: T): T {
  if (typeof value !== 'number') return fallback;
  return list.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), fallback);
}

export function useReaderSettings(): {
  settings: ReaderSettings;
  /** 本地设置已读取（之后再恢复阅读位置，字号等已生效） */
  ready: boolean;
  updateSettings: (patch: Partial<ReaderSettings>) => void;
} {
  const { isDark } = useTheme();
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = loadSettings();
    setSettings({
      fontSize: nearest(FONT_SIZES, saved?.fontSize, 18),
      lineHeight: nearest(LINE_HEIGHTS, saved?.lineHeight, 1.9),
      font: saved?.font === 'sans' ? 'sans' : 'serif',
      theme: READER_THEMES.some((t) => t.id === saved?.theme) ? (saved!.theme as ReaderTheme) : isDark ? 'night' : 'paper',
    });
    setReady(true);
    // 只在进入页面时读取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...patch };
      saveSettings(merged);
      return merged;
    });
  };

  return { settings, ready, updateSettings };
}

interface ReaderSettingsPanelProps {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onClose: () => void;
}

export function ReaderSettingsPanel({ settings, onChange, onClose }: ReaderSettingsPanelProps) {
  const fontIndex = FONT_SIZES.indexOf(settings.fontSize as (typeof FONT_SIZES)[number]);

  return (
    <div id="nv-settings" role="dialog" aria-label="阅读设置" className="nv-line mx-auto max-w-5xl border-t px-4 pb-5 pt-4 sm:px-5">
      <div className="mx-auto grid max-w-xl gap-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="nv-muted w-12 shrink-0">字号</span>
          <div className="flex flex-1 items-center gap-3">
            <button type="button" aria-label="缩小字号" disabled={fontIndex <= 0}
              onClick={() => onChange({ fontSize: FONT_SIZES[Math.max(0, fontIndex - 1)] })}
              className="nv-line rounded-full border px-3 py-1 text-xs transition-colors duration-300 hover:bg-current/10 disabled:opacity-30">A−</button>
            <input
              id="nv-font-size"
              type="range"
              min={0}
              max={FONT_SIZES.length - 1}
              value={Math.max(0, fontIndex)}
              onChange={(e) => onChange({ fontSize: FONT_SIZES[Number(e.target.value)] })}
              aria-label="字号"
              className="nv-range flex-1"
            />
            <button type="button" aria-label="放大字号" disabled={fontIndex >= FONT_SIZES.length - 1}
              onClick={() => onChange({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, fontIndex + 1)] })}
              className="nv-line rounded-full border px-3 py-1 text-base transition-colors duration-300 hover:bg-current/10 disabled:opacity-30">A+</button>
            <span className="w-10 text-right tabular-nums">{settings.fontSize}px</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="nv-muted w-12 shrink-0">行距</span>
          <div className="flex flex-1 gap-2">
            {LINE_HEIGHTS.map((lh, i) => (
              <button key={lh} type="button" onClick={() => onChange({ lineHeight: lh })} aria-pressed={settings.lineHeight === lh}
                className={`nv-line flex-1 rounded-full border py-1.5 text-xs transition-colors duration-300 ${settings.lineHeight === lh ? 'bg-current/10 font-bold' : 'hover:bg-current/5'}`}>
                {['紧凑', '适中', '宽松'][i]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="nv-muted w-12 shrink-0">字体</span>
          <div className="flex flex-1 gap-2">
            {FONTS.map((f) => (
              <button key={f.id} type="button" onClick={() => onChange({ font: f.id })} aria-pressed={settings.font === f.id}
                className={`nv-line flex-1 rounded-full border py-1.5 text-xs transition-colors duration-300 ${settings.font === f.id ? 'bg-current/10 font-bold' : 'hover:bg-current/5'}`}
                style={{ fontFamily: f.id === 'serif' ? 'var(--font-serif), serif' : 'system-ui, sans-serif' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="nv-muted w-12 shrink-0">底色</span>
          <div className="flex flex-1 gap-2">
            {READER_THEMES.map((t) => (
              <button key={t.id} type="button" onClick={() => onChange({ theme: t.id })} aria-pressed={settings.theme === t.id}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] transition-colors duration-300 ${settings.theme === t.id ? 'bg-current/10 font-bold' : 'hover:bg-current/5'}`}>
                <span className="h-6 w-6 rounded-full ring-1 ring-black/15" style={{ background: t.swatch }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={onClose} className="nv-muted mx-auto flex items-center gap-1 text-xs hover:underline">
          <X size={13} /> 收起
        </button>
      </div>
    </div>
  );
}
