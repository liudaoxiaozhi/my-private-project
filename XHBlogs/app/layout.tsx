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
import PetSaber from '../components/PetSaber';
import DanmakuBackground from '../components/DanmakuBackground';
import Sakura from '../components/Sakura';

import MobileBackButton from '../components/MobileBackButton';
import HideOnReader from '../components/HideOnReader';
import Navbar from '../components/Navbar';
import RouteTransition from '../components/RouteTransition';
import NavigationProgress from '../components/NavigationProgress';
import { getImageMeta, toAccentHue } from '../lib/imageMeta';
import { effectsInitScript } from '../lib/effects';
import EffectGate from '../components/EffectGate';
import CoverTransition from '../components/CoverTransition';
import CommandPalette from '../components/CommandPalette';
import EasterEggs from '../components/EasterEggs';
import CardFx from '../components/CardFx';

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

/**
 * 首屏强调色：取第一张背景图的主色调（电脑端 / 手机端各自的第一张），
 * 之后背景轮播时由 BackgroundSlider 接着切换。使用渐变背景时保持默认的 indigo。
 */
function initialAccentCss(): string {
  if (siteConfig.useGradient || siteConfig.bgImages.length === 0) return '';
  const desktop = toAccentHue(getImageMeta(siteConfig.bgImages[0])?.hue);
  const mobile = toAccentHue(getImageMeta(siteConfig.bgImagesMobile[0] ?? siteConfig.bgImages[0])?.hue);
  return `:root { --accent-hue: ${desktop}; } @media (max-width: 767px) { :root { --accent-hue: ${mobile}; } }`;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* 🌗 必须放在最前：绘制前确定深浅色，避免闪烁（替代旧版「挂载前隐藏整页」） */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* ✨ 同样放在最前：首屏绘制前定好特效档位（完整 / 简洁 / 阅读），见 lib/effects.ts */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: effectsInitScript }} />
        <style
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              #app-mount-root { opacity: 0; visibility: hidden; pointer-events: none; }
              html.splash-seen #app-mount-root { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
              ${initialAccentCss()}
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
          <NavigationProgress />
          <CoverTransition />
          <EasterEggs />
          <CardFx />

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

                {/* 隐藏手机端高负载粒子特效；siteConfig.enableParticles 可整体关闭；只在「完整」档显示 */}
                {siteConfig.enableParticles && (
                  <EffectGate min="full" className="hidden md:block absolute inset-0 w-full h-full">
                    <BackgroundEffects />
                  </EffectGate>
                )}
              </div>

              {/* 隐藏手机端弹幕；siteConfig.enableDanmaku 可关闭；只在「完整」档显示 */}
              {siteConfig.enableDanmaku && (
                <EffectGate min="full" className="hidden md:block">
                  <DanmakuBackground />
                </EffectGate>
              )}

              <div className="relative z-10 flex-1 flex flex-col">
                {/* 导航栏常驻：换页时不再卸载重建（小说阅读页不显示） */}
                <HideOnReader>
                  <Navbar />
                </HideOnReader>
                <RouteTransition>{children}</RouteTransition>
              </div>

              {/* 小说阅读页是沉浸式的，这些浮层在那里不显示 */}
              <HideOnReader>
                <div className="hidden md:block">
                  <FloatingPlayer />
                </div>

                <div className="hidden md:block">
                  <GlobalToolbox />
                </div>

                <div className="md:hidden block">
                  <MobileBackButton />
                </div>

                {/* ⌘K 命令面板（需要读取音乐播放状态，放在 MusicProvider 里面） */}
                <CommandPalette />
              </HideOnReader>

              {/* 隐藏手机端点击涟漪；siteConfig.enableClickEffect 可关闭；只在「完整」档显示 */}
              {siteConfig.enableClickEffect && (
                <HideOnReader>
                  <EffectGate min="full" className="hidden md:block">
                    <ClickEffect />
                  </EffectGate>
                </HideOnReader>
              )}
            </div>

          </MusicProvider>

          {/* 樱花飘落：在内容前面、不拦截点击；阅读页不显示；「简洁」档花瓣减半，「阅读」档关闭 */}
          {siteConfig.enableSakura && (
            <HideOnReader>
              <EffectGate min="lite">
                <Sakura />
              </EffectGate>
            </HideOnReader>
          )}

          {/* 右下角桌宠（仅电脑端；阅读页不显示） */}
          {siteConfig.enablePet && (
            <HideOnReader>
              <div className="hidden md:block">
                <PetSaber />
              </div>
            </HideOnReader>
          )}

        </ThemeProvider>
      </body>
    </html>
  );
}