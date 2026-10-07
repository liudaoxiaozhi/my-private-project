// components/ClientSocials.tsx —— 文章 / 杂谈详情页侧栏的社交图标
"use client";

import SocialLinks from './SocialLinks';

export default function ClientSocials() {
  // 复制成功的反馈由按钮自身显示（对勾），这里不再使用 alert 弹窗
  return <SocialLinks size="sm" className="justify-center mt-4" />;
}
