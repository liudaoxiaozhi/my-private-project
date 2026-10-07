"use client";
import { useTheme } from './ThemeProvider';
import Fireflies from './Fireflies';
import Sakura from './Sakura';
import WindyGrass from './WindyGrass';

export default function BackgroundEffects() {
  const { isDark } = useTheme();

  return (
    <>
      {/*
        🚀 性能：只挂载当前主题的特效。旧版两套同时运行、只用透明度隐藏其中一套，
        看不见的那套动画也在持续消耗性能。
      */}
      {isDark ? <Fireflies /> : <Sakura />}

      {/* 草地一直存在，但它内部会自动改变颜色 */}
      <WindyGrass />
    </>
  );
}