"use client";
// app/music/ArtworkBackground.tsx —— 用当前封面生成缓慢流动的模糊背景（Apple Music 播放页风格）
//
// 不读取图片像素（网易云封面不允许跨域读取），而是直接把封面放大、重度模糊后叠三层慢速漂移。
// 模糊写在内层、动画只改外层 transform，浏览器只需栅格化一次，滚动和播放时都很省。

import { AnimatePresence, motion } from 'framer-motion';
import AppImage from '../../components/AppImage';
import { coverAtSize } from './musicUtils';

export default function ArtworkBackground({ cover }: { cover?: string }) {
  const src = cover ? coverAtSize(cover, 200) : '';

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#0d0d12] pointer-events-none" aria-hidden="true">
      <AnimatePresence initial={false}>
        {src && (
          <motion.div
            key={src}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
          >
            {/* 底层：整张封面铺满并模糊，保证任何角落都有颜色 */}
            <div className="absolute -inset-[15%] blur-[90px] saturate-150 brightness-75">
              <AppImage src={src} fill sizes="200px" className="object-cover" referrerPolicy="no-referrer" />
            </div>
            {/* 三团慢速漂移的色块，形成流动感 */}
            {['am-blob-1', 'am-blob-2', 'am-blob-3'].map((cls) => (
              <div key={cls} className={`am-blob ${cls}`}>
                <div className="am-blob-inner">
                  <AppImage src={src} fill sizes="200px" className="object-cover" referrerPolicy="no-referrer" />
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 压暗 + 暗角，保证白色文字始终清晰 */}
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)]" />
    </div>
  );
}
