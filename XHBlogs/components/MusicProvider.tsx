"use client";

import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import type { LocalPlaylistManifest, LyricLine, NeteaseLyricPayload, NeteaseTrack, Song } from '../lib/music';
import { buildNeteaseLyrics, parseLrc } from '../lib/lyrics';
import { siteConfig } from '../siteConfig';
import neteaseData from '../data/netease.json';

/** 访客这次浏览里亲手按过暂停：不再自动播放（sessionStorage） */
const USER_PAUSED_KEY = 'music-user-paused';

function userPaused(): boolean {
  try {
    return sessionStorage.getItem(USER_PAUSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** 歌曲既没有同名封面也没有内嵌封面时使用 */
const DEFAULT_COVER = '/images/music-default-cover.svg';

const PURE_MUSIC_TEXT = '♪ 纯享音乐 ♪';

/** 本地歌单：public/music/playlist.json（构建时生成）。文件不存在或为空时返回 [] */
async function fetchLocalSongs(): Promise<Song[]> {
  const res = await fetch('/music/playlist.json', { cache: 'no-store' });
  if (!res.ok) return [];
  const manifest = (await res.json()) as Partial<LocalPlaylistManifest>;
  return (Array.isArray(manifest.tracks) ? manifest.tracks : [])
    .filter((t) => typeof t?.src === 'string' && t.src)
    .map((t) => ({
      id: t.id,
      source: 'local' as const,
      title: t.title || '未知歌曲',
      artist: t.artist || '未知歌手',
      cover: t.cover || DEFAULT_COVER,
      src: t.src,
      lyrics: [],
      lrcUrl: t.lrcUrl,
    }));
}

/**
 * 网易云歌曲（后台导入，data/netease.json）：用官方外链播放，歌词由 /api/music/lyric 代取。
 * VIP / 付费歌曲外链放不了，会像加载失败一样自动跳到下一首
 */
function neteaseSongs(): Song[] {
  return (neteaseData as NeteaseTrack[]).map((t) => ({
    id: `netease:${t.id}`,
    source: 'netease' as const,
    title: t.title || '未知歌曲',
    artist: t.artist || '未知歌手',
    cover: t.cover || DEFAULT_COVER,
    src: `https://music.163.com/song/media/outer/url?id=${t.id}.mp3`,
    lyrics: [],
    lrcUrl: `/api/music/lyric?id=${t.id}`,
  }));
}

/** 歌词文件 → 歌词行：网易云接口返回 JSON（含逐字歌词和翻译），本地 .lrc 是纯文本；旧缓存里的纯文本也能认 */
function parseLyricResponse(body: string): LyricLine[] {
  const text = body.trim();
  if (text.startsWith('{')) {
    try {
      return buildNeteaseLyrics(JSON.parse(text) as Partial<NeteaseLyricPayload>);
    } catch {
      return [];
    }
  }
  return parseLrc(text);
}

// 🌟 1. 扩充 Context 类型，加入 MusicPage 需要的所有属性
type PlayMode = 'loop' | 'single' | 'random';

interface MusicContextType {
  playlist: Song[];
  currentIndex: number;
  currentSong: Song | undefined;
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  currentLyric: string;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
  playMode: PlayMode;

  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** 跳转到指定进度（0~100） */
  seekToPercent: (percent: number) => void;
  playSong: (index: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  togglePlayMode: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentLyric, setCurrentLyric] = useState("正在连接高可用神经云端...");
  const [isLoading, setIsLoading] = useState(true);

  // 🌟 2. 新增音量和播放模式状态
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('loop');

  const audioRef = useRef<HTMLAudioElement>(null);
  /** 连续加载失败的次数；整张歌单都失败时停止跳歌，避免无限循环 */
  const failStreakRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const loadPlaylist = async () => {
      // 网易云的在前，本地上传的接在后面
      let merged: Song[] = neteaseSongs();
      try {
        merged = [...merged, ...(await fetchLocalSongs())];
      } catch (error) {
        console.warn('[music] 本地歌单加载失败：', error);
      }
      if (!isMounted) return;

      if (merged.length > 0) setPlaylist(merged);
      else setCurrentLyric('歌单还是空的');
      setIsLoading(false);
    };

    loadPlaylist();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (playlist.length === 0) return;
    let isMounted = true;
    const currentSong = playlist[currentIndex];
    setLyrics([]);
    setCurrentLyric("♪ 正在缓冲 ♪");
    if (currentSong.lyrics.length > 0) {
      // 网易云歌词随歌单一起返回；本地歌词加载过一次后也会缓存在这里
      setLyrics(currentSong.lyrics);
      setCurrentLyric(currentSong.lyrics[0]?.time === -1 ? `♪ ${currentSong.title} ♪` : currentSong.lyrics[0]?.text || PURE_MUSIC_TEXT);
    } else if (currentSong.lrcUrl) {
      // 本地歌曲：切到这首时才加载同名 .lrc
      fetch(currentSong.lrcUrl)
        .then((res) => (res.ok ? res.text() : ''))
        .then((text) => {
          if (!isMounted) return;
          const parsed = parseLyricResponse(text);
          setLyrics(parsed);
          // 纯文本歌词没有时间轴，顶部歌词条显示歌名即可
          setCurrentLyric(parsed[0]?.time === -1 ? `♪ ${currentSong.title} ♪` : parsed[0]?.text || PURE_MUSIC_TEXT);
          // 不可变更新，供音乐页的滚动歌词使用；只改内容不改长度，不会重新触发本 effect
          setPlaylist((prev) => prev.map((s) => (s.id === currentSong.id ? { ...s, lyrics: parsed } : s)));
        })
        .catch(() => { if (isMounted) setCurrentLyric(PURE_MUSIC_TEXT); });
    } else {
      setCurrentLyric(PURE_MUSIC_TEXT);
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.play().catch((err: unknown) => {
        // 只有浏览器拦截自动播放时才暂停；加载失败交给 onError 自动跳到下一首
        if (err instanceof DOMException && err.name === 'NotAllowedError') setIsPlaying(false);
      });
    }
    return () => { isMounted = false; };
  }, [currentIndex, playlist.length]); // 移除 playlist 依赖防止无限循环，只依赖长度

  // 自动播放（siteConfig.autoPlayMusic）：歌单加载好就试着播；浏览器拦下（没和页面互动过不许出声）时，
  // 等访客第一次点击 / 触摸 / 按键再开始。后台页面、访客这次浏览里按过暂停时不自动播
  const autoplayTried = useRef(false);
  useEffect(() => {
    if (!siteConfig.autoPlayMusic || playlist.length === 0 || autoplayTried.current) return;
    autoplayTried.current = true;
    if (userPaused() || /^\/admin(\/|$)/.test(window.location.pathname)) return;
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    const start = () => {
      events.forEach((e) => window.removeEventListener(e, start, true));
      const audio = audioRef.current;
      if (!audio || !audio.paused || userPaused()) return;
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    };
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => events.forEach((e) => window.addEventListener(e, start, { capture: true, once: true, passive: true })));
    return () => events.forEach((e) => window.removeEventListener(e, start, true));
  }, [playlist.length]);

  // 🌟 4. 同步音量到 audio 元素
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        try {
          sessionStorage.setItem(USER_PAUSED_KEY, '1');
        } catch {
          /* 忽略 */
        }
      } else audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(!isPlaying);
    }
  };

  // 🌟 5. 重写 nextSong，加入对随机模式的处理
  const nextSong = () => {
    if (playMode === 'random') {
      setCurrentIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }
  };

  const prevSong = () => {
    if (playMode === 'random') {
      setCurrentIndex(Math.floor(Math.random() * playlist.length));
    } else {
      setCurrentIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
    }
  };

  // 🌟 6. 暴露直接播放指定歌曲的方法
  const playSong = (index: number) => {
    setCurrentIndex(index);
    if (!isPlaying) setIsPlaying(true); // 保证切歌后自动播放
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const { currentTime, duration } = audioRef.current;
      setCurrentTime(currentTime);
      setDuration(duration || 0);
      setProgress((currentTime / (duration || 1)) * 100);

      // 纯文本歌词（time = -1）没有时间轴，不参与滚动
      if (lyrics.length > 0 && lyrics[0].time >= 0) {
        const activeLyric = lyrics.slice().reverse().find(l => currentTime >= l.time);
        if (activeLyric && activeLyric.text !== currentLyric) {
          setCurrentLyric(activeLyric.text);
        }
      }
    }
  };

  // 🌟 7. 处理歌曲结束
  const handleEnded = () => {
    if (playMode === 'single' && audioRef.current) {
       audioRef.current.currentTime = 0;
       audioRef.current.play();
    } else {
       nextSong();
    }
  };

  /**
   * 加载失败（文件不存在、格式不支持）时自动跳到下一首。
   * 按顺序跳而不是随机跳，保证每首都会尝试到；整张歌单都失败则停止。
   */
  const handleAudioError = () => {
    const failed = playlist[currentIndex];
    if (!failed) return;
    console.warn(`[music] 无法播放「${failed.title}」（${failed.id}），可能是文件不存在或浏览器不支持该格式，已自动跳过`);
    failStreakRef.current += 1;
    if (failStreakRef.current >= playlist.length) {
      failStreakRef.current = 0;
      setIsPlaying(false);
      setCurrentLyric('歌单中的歌曲暂时都无法播放');
      return;
    }
    setCurrentIndex((prev) => (prev + 1) % playlist.length);
  };

  /** 能正常加载就清零失败计数 */
  const handleCanPlay = () => { failStreakRef.current = 0; };

  const seekToPercent = (percent: number) => {
    const newProgress = Math.min(100, Math.max(0, percent));
    setProgress(newProgress);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (newProgress / 100) * audioRef.current.duration;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => seekToPercent(Number(e.target.value));

  const setVolume = (val: number) => {
    setVolumeState(val);
    if (isMuted && val > 0) setIsMuted(false);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  const togglePlayMode = () => {
    setPlayMode(prev => {
      if (prev === 'loop') return 'single';
      if (prev === 'single') return 'random';
      return 'loop';
    });
  };

  const currentSong = playlist[currentIndex];

  return (
    <MusicContext.Provider value={{
        playlist, currentIndex, currentSong, isPlaying, progress, currentTime, duration, currentLyric, isLoading,
        volume, isMuted, playMode, // 暴露新状态
        togglePlay, nextSong, prevSong, handleSeek, seekToPercent,
        playSong, setVolume, toggleMute, togglePlayMode // 暴露新方法
    }}>
      {children}
      {currentSong && (
        <audio
          ref={audioRef}
          src={currentSong.src}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded} // 使用我们重写的结束处理
          onLoadedMetadata={handleTimeUpdate}
          onCanPlay={handleCanPlay}
          onError={handleAudioError}
          preload="metadata"
        />
      )}
    </MusicContext.Provider>
  );
}

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) throw new Error("useMusic must be used within MusicProvider");
  return context;
};
