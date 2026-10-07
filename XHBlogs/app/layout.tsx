import 'katex/dist/katex.min.css';
import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { themeInitScript } from "../lib/theme";
import { SITE_URL } from "../lib/site";
import BackgroundEffects from "../components/BackgroundEffects";
import { MusicProvider } from "../components/MusicProvider";
import FloatingPlayer from "../components/FloatingPlayer";
import { siteConfig } from "../siteConfig";
import ClickEffect from "../components/ClickEffect";
import BackgroundSlider from "../components/BackgroundSlider";
import GlobalToolbox from "../components/GlobalToolbox";
import SplashScreen from "../components/SplashScreen";
import CyberCat from '../components/CyberCat';
import DanmakuBackground from '../components/DanmakuBackground';

import MobileBackButton from '../components/MobileBackButton';

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const notoSerif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-serif",
  display: 'swap',
});

export const metadata: Metadata = {
  // 让 OG 卡片等元数据里的相对地址（如 /images/...）补全为绝对地址
  metadataBase: new URL(SITE_URL),
  title: siteConfig.title,
  description: siteConfig.bio,
  icons: {
    icon: siteConfig.faviconUrl,
    apple: siteConfig.faviconUrl,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* 🌗 必须放在最前：绘制前确定深浅色，避免闪烁（替代旧版「挂载前隐藏整页」） */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <style
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              #app-mount-root { opacity: 0; visibility: hidden; pointer-events: none; }
              html.splash-seen #app-mount-root { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
            `
          }}
        />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (sessionStorage.getItem('hasSeenSplash') === 'true') {
                  document.documentElement.classList.add('splash-seen');
                }
              } catch (e) {}
            `
          }}
        />
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <ThemeProvider>

          <SplashScreen />

          <MusicProvider>
            <div id="app-mount-root" className="flex-1 flex flex-col transition-opacity duration-1000">
              <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
                {!siteConfig.useGradient && <BackgroundSlider />}
                {/* 🚀 性能：模糊已移到 BackgroundSlider 的图片层（静态 filter，只栅格化一次），这里只保留半透明色调，不再用全屏 backdrop-filter */}
                <div className="absolute inset-0 z-[-9] bg-white/30 dark:bg-slate-900/40 transition-colors duration-1000"></div>

                {/*
                  🚀 性能：主题渐变改为静态。旧版每帧移动全屏渐变（再叠加 mix-blend 混色），
                  导致页面上所有毛玻璃卡片每一帧都要重新计算模糊，是全站卡顿的主要来源。
                */}
                <div
                  className="absolute inset-0 z-[-8] opacity-60 dark:opacity-20 mix-blend-color transition-opacity duration-1000"
                  style={{ background: `linear-gradient(-45deg, ${siteConfig.themeColors.join(', ')})` }}
                ></div>

                {/* 👇 🌟 优化：手机端去掉了 mix-blend-overlay，但保留了 blur 模糊光晕，确保视觉不打折 */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full z-[-7] md:mix-blend-overlay"></div>

                {/* 隐藏手机端高负载粒子特效；siteConfig.enableParticles 可整体关闭 */}
                {siteConfig.enableParticles && (
                  <div className="hidden md:block absolute inset-0 w-full h-full">
                    <BackgroundEffects />
                  </div>
                )}
              </div>

              {/* 隐藏手机端弹幕；siteConfig.enableDanmaku 可关闭 */}
              {siteConfig.enableDanmaku && (
                <div className="hidden md:block">
                  <DanmakuBackground />
                </div>
              )}

              <div className="relative z-10 flex-1 flex flex-col">
                {children}
              </div>

              <div className="hidden md:block">
                <FloatingPlayer />
              </div>

              <div className="hidden md:block">
                <GlobalToolbox />
              </div>

              <div className="md:hidden block">
                <MobileBackButton />
              </div>

              {/* 隐藏手机端点击涟漪；siteConfig.enableClickEffect 可关闭 */}
              {siteConfig.enableClickEffect && (
                <div className="hidden md:block">
                  <ClickEffect />
                </div>
              )}
            </div>

          </MusicProvider>

          {siteConfig.enableCyberCat && (
            <div className="hidden md:block">
              <CyberCat />
            </div>
          )}

        </ThemeProvider>
      </body>
    </html>
  );
}