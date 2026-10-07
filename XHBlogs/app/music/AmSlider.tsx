"use client";
// app/music/AmSlider.tsx —— 细胶囊进度条（悬停 / 拖动时变粗），用于播放进度与音量
//
// 拖动过程中只更新本地预览值，松手才提交，避免拖动时音频反复跳转。支持键盘左右方向键。

import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { clamp } from './musicUtils';

interface AmSliderProps {
  /** 0 ~ 1 */
  value: number;
  /** 松手 / 键盘调整时提交，0 ~ 1 */
  onCommit: (value: number) => void;
  /** 拖动中实时回调（例如音量需要即时生效） */
  onScrub?: (value: number) => void;
  /** 拖动预览值变化时通知父组件（例如进度条拖动时更新时间显示） */
  onPreview?: (value: number | null) => void;
  ariaLabel: string;
  ariaValueText?: string;
  /** 方向键每次调整的比例 */
  keyboardStep?: number;
  className?: string;
}

export default function AmSlider({
  value, onCommit, onScrub, onPreview, ariaLabel, ariaValueText, keyboardStep = 0.05, className = '',
}: AmSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? clamp(value || 0, 0, 1);

  const valueAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return shown;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  const update = (v: number) => {
    setDragValue(v);
    onScrub?.(v);
    onPreview?.(v);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    update(valueAt(e.clientX));
  };
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragValue !== null) update(valueAt(e.clientX));
  };
  const finish = (e: PointerEvent<HTMLDivElement>) => {
    if (dragValue === null) return;
    onCommit(valueAt(e.clientX));
    setDragValue(null);
    onPreview?.(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? keyboardStep
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -keyboardStep : 0;
    if (!delta) return;
    e.preventDefault();
    onCommit(clamp(shown + delta, 0, 1));
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={ariaValueText}
      data-dragging={dragValue !== null}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={handleKeyDown}
      className={`am-slider group relative flex h-5 cursor-pointer touch-none items-center rounded-full outline-none ${className}`}
    >
      <div ref={trackRef} className="am-bar relative h-[5px] w-full overflow-hidden rounded-full bg-white/20">
        <div className="am-bar-fill absolute inset-y-0 left-0 rounded-full bg-white/75" style={{ width: `${shown * 100}%` }} />
      </div>
    </div>
  );
}
