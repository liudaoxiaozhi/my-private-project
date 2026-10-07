"use client";
import { useTheme } from './ThemeProvider';
import Fireflies from './Fireflies';
import WindyGrass from './WindyGrass';

export default function BackgroundEffects() {
  const { isDark } = useTheme();

  return (
    <>
      {/*
        🚀 性能：只挂载当前主题的特效。夜间是萤火虫；樱花已改为全站前景层（components/Sakura.tsx，在 layout 里挂载）
      */}
      {isDark && <Fireflies />}

      {/* 草地一直存在，但它内部会自动改变颜色 */}
      <WindyGrass />
    </>
  );
}