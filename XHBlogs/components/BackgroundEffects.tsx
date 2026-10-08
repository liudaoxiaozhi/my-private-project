"use client";
// components/BackgroundEffects.tsx —— 背景里的「完整」档特效（只在电脑端）：底部随风摆动的草地
//
// 原来夜间还有萤火虫，已经去掉：背景里一直在动的东西会让所有毛玻璃卡片每一帧重新计算模糊；
// 夜间的氛围改由前景的樱花（components/Sakura.tsx）负责。
import WindyGrass from './WindyGrass';

export default function BackgroundEffects() {
  return <WindyGrass />;
}
