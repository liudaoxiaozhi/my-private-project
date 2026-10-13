"use client";
// app/music/MusicClient.tsx —— 音乐页：Apple Music 风格的沉浸式播放页
//
// 布局：左侧封面 + 歌名 + 进度 + 控制；右侧歌词 / 播放列表。手机上上下堆叠。
// 整页固定为深色（外层 .dark），背景随封面取色流动，不受站点日夜模式影响。

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FastForward, ListMusic, MessageSquare, MessageSquareQuote, Pause, Play,
  Repeat, Repeat1, Rewind, Shuffle, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import Comments from '../../components/Comments';
import AppImage from '../../components/AppImage';
import { useMusic } from '../../components/MusicProvider';
import ArtworkBackground from './ArtworkBackground';
import AmSlider from './AmSlider';
import LyricsPanel from './LyricsPanel';
import QueuePanel from './QueuePanel';
import { formatTime } from './musicUtils';
import './music.css';

type Panel = 'lyrics' | 'queue';

const PLAY_MODE_META = {
  loop: { Icon: Repeat, label: '列表循环' },
  single: { Icon: Repeat1, label: '单曲循环' },
  random: { Icon: Shuffle, label: '随机播放' },
} as const;

/** 圆形透明按钮：只有悬停时出现浅色底 */
const GHOST_BTN =
  'flex items-center justify-center rounded-full text-white transition-all duration-300 ease-out hover:bg-white/10 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50';

export default function MusicClient() {
  const {
    playlist, currentSong, isPlaying, currentTime, duration, isLoading,
    togglePlay, nextSong, prevSong, seekToPercent, playSong,
    playMode, togglePlayMode, volume, setVolume, isMuted, toggleMute,
  } = useMusic();

  const [panel, setPanel] = useState<Panel>('lyrics');
  /** 拖动进度条时的预览比例，用于实时显示时间 */
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const shownTime = scrubRatio !== null ? scrubRatio * safeDuration : currentTime;
  const ModeIcon = PLAY_MODE_META[playMode].Icon;
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : Volume1;

  const seekToTime = (seconds: number) => {
    if (safeDuration > 0) seekToPercent((seconds / safeDuration) * 100);
  };

  // —— 加载中 / 空歌单 ——
  if (isLoading || !currentSong) {
    return (
      <div className="dark am-root relative min-h-[100dvh] text-white">
        <ArtworkBackground />
        <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center">
          {isLoading ? (
            <>
              <div className="h-56 w-56 animate-pulse rounded-2xl bg-white/10" />
              <p className="text-sm tracking-wide text-white/50">正在载入歌单…</p>
            </>
          ) : (
            <>
              <ListMusic size={48} className="text-white/30" />
              <p className="text-xl text-white/80">歌单还是空的</p>
              <p className="max-w-sm text-sm leading-relaxed text-white/45">
                把音频文件放进 public/music/，然后重新运行 npm run dev 或 npm run build。
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    // 外层加 .dark：评论区等子组件在本页一律使用深色样式（导航栏在根布局里，由 Navbar 自己切换深色）
    <div className="dark am-root relative min-h-[100dvh] text-white">
      <ArtworkBackground cover={currentSong.cover} />
      <main className="relative z-10">
        {/* ================= 播放器（占满一屏） ================= */}
        <section
          aria-label="正在播放"
          className="mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-8 px-5 pb-10 pt-24 sm:px-8 lg:h-[100dvh] lg:min-h-[640px] lg:grid-cols-[minmax(320px,440px)_1fr] lg:grid-rows-[minmax(0,1fr)] lg:gap-16 lg:px-12 lg:pb-10 lg:pt-24"
        >
          {/* ---------- 左：封面与控制 ---------- */}
          <div className="flex min-w-0 flex-col justify-center">
            {/* 封面：播放时原尺寸，暂停时略微缩小，带一点回弹 */}
            <motion.div
              animate={{ scale: isPlaying ? 1 : 0.86 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="am-art-w relative mx-auto aspect-square w-[min(78vw,360px)] overflow-hidden rounded-[14px] bg-white/10 shadow-[0_28px_60px_-12px_rgba(0,0,0,0.6)]"
            >
              <AppImage
                key={currentSong.id}
                src={currentSong.cover}
                alt={`${currentSong.title} 封面`}
                fill
                sizes="(min-width: 1024px) 440px, 78vw"
                loading="eager"
                className="object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            <div className="am-meta-w mx-auto mt-6 w-full max-w-[360px] lg:mt-5">
              {/* 歌名 / 歌手 */}
              <div className="min-w-0">
                <h1 className="truncate text-[1.35rem] leading-tight text-white">{currentSong.title}</h1>
                <p className="mt-1 truncate text-[1.05rem] text-white/60">{currentSong.artist}</p>
              </div>

              {/* 进度条：右侧显示剩余时间 */}
              <div className="mt-5">
                <AmSlider
                  value={safeDuration ? currentTime / safeDuration : 0}
                  onCommit={(v) => seekToPercent(v * 100)}
                  onPreview={setScrubRatio}
                  ariaLabel="播放进度"
                  ariaValueText={`${formatTime(shownTime)} / ${formatTime(safeDuration)}`}
                  keyboardStep={safeDuration ? 5 / safeDuration : 0.02}
                />
                <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-white/50">
                  <span>{formatTime(shownTime)}</span>
                  <span>{formatTime(shownTime - safeDuration)}</span>
                </div>
              </div>

              {/* 播放控制 */}
              <div className="mt-2 flex items-center justify-center gap-6 sm:gap-8">
                <button type="button" onClick={prevSong} aria-label="上一首" className={`${GHOST_BTN} h-14 w-14`}>
                  <Rewind size={30} fill="currentColor" strokeWidth={0} />
                </button>
                <button type="button" onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'} className={`${GHOST_BTN} h-16 w-16`}>
                  {isPlaying
                    ? <Pause size={40} fill="currentColor" strokeWidth={0} />
                    : <Play size={40} fill="currentColor" strokeWidth={0} className="translate-x-[2px]" />}
                </button>
                <button type="button" onClick={nextSong} aria-label="下一首" className={`${GHOST_BTN} h-14 w-14`}>
                  <FastForward size={30} fill="currentColor" strokeWidth={0} />
                </button>
              </div>

              {/* 音量 */}
              <div className="mt-3 flex items-center gap-3 text-white/55">
                <button type="button" onClick={toggleMute} aria-label={isMuted ? '取消静音' : '静音'} className="rounded p-0.5 transition-colors duration-300 hover:text-white">
                  <VolumeIcon size={16} />
                </button>
                <AmSlider
                  value={isMuted ? 0 : volume}
                  onScrub={setVolume}
                  onCommit={setVolume}
                  ariaLabel="音量"
                  ariaValueText={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
                  className="flex-1"
                />
                <Volume2 size={16} aria-hidden="true" />
              </div>

              {/* 播放模式 / 面板切换 */}
              <div className="mt-4 flex items-center justify-between lg:mt-3">
                <button
                  type="button"
                  onClick={togglePlayMode}
                  aria-label={`播放模式：${PLAY_MODE_META[playMode].label}，点击切换`}
                  title={PLAY_MODE_META[playMode].label}
                  className={`${GHOST_BTN} h-9 w-9 ${playMode === 'loop' ? 'text-white/55' : 'bg-white/15'}`}
                >
                  <ModeIcon size={17} />
                </button>
                <div className="flex items-center gap-1" role="tablist" aria-label="右侧面板">
                  {([
                    { id: 'lyrics', Icon: MessageSquareQuote, label: '歌词' },
                    { id: 'queue', Icon: ListMusic, label: '播放列表' },
                  ] as const).map(({ id, Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={panel === id}
                      aria-label={label}
                      title={label}
                      onClick={() => setPanel(id)}
                      className={`${GHOST_BTN} h-9 w-9 rounded-lg ${panel === id ? 'bg-white/15 text-white' : 'text-white/55'}`}
                    >
                      <Icon size={17} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ---------- 右：歌词 / 播放列表 ---------- */}
          <div className="h-[58vh] min-h-[360px] min-w-0 lg:h-full lg:min-h-0" role="tabpanel">
            {panel === 'lyrics' ? (
              <LyricsPanel
                lyrics={currentSong.lyrics}
                currentTime={shownTime}
                duration={safeDuration}
                isPlaying={isPlaying}
                onSeekTime={seekToTime}
                emptyText="纯音乐，请欣赏"
              />
            ) : (
              <QueuePanel playlist={playlist} currentId={currentSong.id} isPlaying={isPlaying} onPlay={playSong} />
            )}
          </div>
        </section>

        {/* ================= 留言板（向下滚动） ================= */}
        <section aria-labelledby="music-comments-title" className="mx-auto w-full max-w-[1320px] px-5 pb-24 sm:px-8 lg:px-12">
          <div className="rounded-3xl border border-white/10 bg-black/25 px-5 py-8 backdrop-blur-xl sm:px-8 md:px-12">
            <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-5">
              <MessageSquare size={20} className="text-white/60" />
              <div>
                <h2 id="music-comments-title" className="text-lg text-white">乐迷留言板</h2>
                <p className="text-sm text-white/45">聊聊你正在听的歌</p>
              </div>
            </div>
            <Comments />
          </div>
        </section>
      </main>
    </div>
  );
}
