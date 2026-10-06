// components/AppImage.tsx —— 全站统一的图片组件（基于 next/image）
//
// - 白名单来源自动优化，其他外链自动 unoptimized，调用方无需关心域名配置
// - src 为空时不渲染，避免 next/image 抛错（父容器自带底色占位）
// - 默认懒加载；首屏大图（封面、头像）请传 loading="eager" fetchPriority="high"
// 不加 'use client'：Server / Client Component 都能直接使用。
import Image from 'next/image';
import type { ImageProps } from 'next/image';
import { isOptimizableSrc } from '../lib/images';

export type AppImageProps = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null;
  alt?: string;
};

export default function AppImage({ src, alt = '', unoptimized, ...rest }: AppImageProps) {
  if (!src) return null;
  return <Image src={src} alt={alt} unoptimized={unoptimized ?? !isOptimizableSrc(src)} {...rest} />;
}
