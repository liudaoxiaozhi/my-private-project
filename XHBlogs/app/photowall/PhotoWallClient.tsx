"use client";

import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Image as ImageIcon, Images, Search, SearchX } from 'lucide-react';
import { albums, Album } from '../../data/albums';
import AppImage from '../../components/AppImage';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { useEffectsLevel } from '../../components/EffectGate';
import Lightbox, { zoomIn, type LightboxPhoto } from '../../components/photo/Lightbox';
import Viewfinder from '../../components/photo/Viewfinder';
import { useDevelopGuard } from '../../components/photo/useDevelopGuard';

const SEARCH_INPUT =
  'h-10 w-full rounded-full bg-white/70 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 ring-1 ring-black/5 outline-none transition-shadow focus:ring-2 focus:ring-indigo-400 dark:bg-slate-800/60 dark:text-white dark:placeholder-slate-500 dark:ring-white/10';

const PRIMARY_BUTTON =
  'rounded-full bg-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-colors hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2';

/** 搜索结果里的小节标题：毛玻璃胶囊，不直接压在背景上 */
function SectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="glass-chip mb-5 inline-flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
      <span className="text-indigo-500 dark:text-indigo-400">{icon}</span>
      {children}
    </h2>
  );
}

type LightboxScope = 'album' | 'search';
interface LightboxState { scope: LightboxScope; index: number; zoomed: boolean; }

/** 这次打开的相册是不是从列表点进来的（是的话「返回画廊」直接后退，浏览器历史不会多一条） */
let openedFromList = false;
function markOpenedFromList(): void {
  openedFromList = true;
}
function takeOpenedFromList(): boolean {
  const value = openedFromList;
  openedFromList = false;
  return value;
}

/**
 * 照片墙。打开的相册记在网址里（?album=<id>）：浏览器后退回到相册列表，带参数的链接直接打开相册。
 * useSearchParams 需要 Suspense 边界，见 page.tsx；换相册时整个视图按 key 重新挂载（搜索框、灯箱一起复位）。
 */
export default function PhotoWallClient() {
  const albumId = useSearchParams().get('album');
  return <PhotoWallView key={albumId ?? ''} albumId={albumId} />;
}

export function PhotoWallView({ albumId }: { albumId: string | null }) {
  const router = useRouter();
  const level = useEffectsLevel();
  const currentAlbum: Album | null = (albumId && albums.find((a) => a.id === albumId)) || null;
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const albumGridRef = useRef<HTMLDivElement>(null);
  const searchGridRef = useRef<HTMLDivElement>(null);
  useDevelopGuard(albumGridRef, level !== 'off' && currentAlbum !== null);

  const [searchQuery, setSearchQuery] = useState('');
  // 输入停顿 250ms 后才真正生效；两者不一致时就是「过渡中」，直接推导，不再额外存一份状态
  const [activeQuery, setActiveQuery] = useState('');
  const isTransitioning = searchQuery !== activeQuery;

  useEffect(() => {
    if (searchQuery === activeQuery) return;
    const timer = setTimeout(() => setActiveQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery, activeQuery]);

  const query = activeQuery.trim();

  const { matchedAlbums, matchedPhotos } = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return { matchedAlbums: albums, matchedPhotos: [] };

    const matchedAlbums = albums.filter(album =>
      album.title.toLowerCase().includes(q) ||
      album.description.toLowerCase().includes(q)
    );

    const matchedPhotos = albums.flatMap(album =>
      album.photos.map(p => ({ ...p, albumName: album.title }))
    ).filter(photo => photo.caption?.toLowerCase().includes(q));

    return { matchedAlbums, matchedPhotos };
  }, [query]);

  const openAlbum = (album: Album) => {
    markOpenedFromList();
    router.push(`/photowall?album=${encodeURIComponent(album.id)}`);
  };

  const closeAlbum = () => {
    if (takeOpenedFromList()) {
      router.back();
    } else {
      router.push('/photowall');
    }
  };

  const albumPhotos = useMemo<LightboxPhoto[]>(() => currentAlbum?.photos ?? [], [currentAlbum]);
  const searchPhotos = useMemo<LightboxPhoto[]>(
    () => matchedPhotos.map((p) => ({ url: p.url, caption: p.caption, album: p.albumName })),
    [matchedPhotos],
  );

  const getThumb = useCallback((scope: LightboxScope, index: number) => {
    const grid = scope === 'album' ? albumGridRef.current : searchGridRef.current;
    return grid?.querySelector<HTMLElement>(`[data-photo-index="${index}"]`) ?? null;
  }, []);
  const lightboxScope = lightbox?.scope;
  const getLightboxThumb = useCallback((index: number) => (lightboxScope ? getThumb(lightboxScope, index) : null), [getThumb, lightboxScope]);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const openPhoto = (scope: LightboxScope, index: number, thumb: HTMLElement) => {
    zoomIn(thumb, (zoomed) => setLightbox({ scope, index, zoomed }));
  };

  return (
    <div className="min-h-screen relative pb-24">
      <div className="relative z-10 mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">

        {!currentAlbum && (
          <div className="animate-fade-in-up">
            <PageHeader
              icon={<Images size={30} />}
              title="光影画廊"
              subtitle={
                albums.length > 0
                  ? `定格时间，封存泰拉与现实的每一次心跳，共 ${albums.length} 个相册。`
                  : '定格时间，封存泰拉与现实的每一次心跳。'
              }
              actions={
                albums.length > 0 && (
                  <label className="relative block w-full sm:w-72">
                    <span className="sr-only">搜索照片</span>
                    <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="搜索相册名或照片描述..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={SEARCH_INPUT}
                    />
                  </label>
                )
              }
            />

            <div className={`mt-8 transition-opacity duration-300 ease-in-out ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>

              {albums.length === 0 && (
                <EmptyState
                  icon={<Images size={30} />}
                  title="还没有相册"
                  description="在后台「相册」里创建第一个吧。"
                />
              )}

              {query && matchedPhotos.length > 0 && (
                <section className="mb-12">
                  <SectionLabel icon={<ImageIcon size={16} />}>
                    匹配的单张照片 <span className="tabular-nums text-slate-500 dark:text-slate-400">{matchedPhotos.length}</span>
                  </SectionLabel>
                  <div ref={searchGridRef} className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
                    {matchedPhotos.map((photo, index) => (
                      <button data-reveal
                        type="button"
                        key={`search-photo-${index}`}
                        data-photo-index={index}
                        aria-label={`查看大图：${photo.caption || photo.albumName}`}
                        onClick={(e) => openPhoto('search', index, e.currentTarget)}
                        className="block w-full text-left break-inside-avoid relative group rounded-2xl overflow-hidden cursor-zoom-in shadow-lg bg-white/20 dark:bg-slate-800/20 border border-white/30 dark:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                      >
                        <AppImage src={photo.url} alt={photo.caption || '照片'} width={800} height={600} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" />
                        <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-5">
                          <span className="text-indigo-300 font-bold text-xs mb-1 drop-shadow-md">{photo.albumName}</span>
                          <span className="block text-white font-medium text-sm drop-shadow-md translate-y-4 group-hover:translate-y-0 transition-transform duration-500">{photo.caption}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {query && matchedAlbums.length > 0 && (
                <SectionLabel icon={<Images size={16} />}>
                  相关相册 <span className="tabular-nums text-slate-500 dark:text-slate-400">{matchedAlbums.length}</span>
                </SectionLabel>
              )}

              {matchedAlbums.length > 0 && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {matchedAlbums.map((album) => (
                    <div data-reveal
                      key={album.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`打开相册「${album.title}」`}
                      onClick={() => openAlbum(album)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAlbum(album); } }}
                      className="glass-card group flex cursor-pointer flex-col items-center px-5 pb-5 pt-8 transition-shadow duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:px-6 sm:pt-10"
                    >
                      <div className="relative mb-6 aspect-[4/3] w-[85%]">
                        <div className="absolute inset-0 bg-slate-300 dark:bg-slate-700 rounded-[4px] shadow-md transform rotate-6 translate-x-3 translate-y-2 group-hover:rotate-[9deg] group-hover:translate-x-5 transition-all duration-500 border-[6px] border-white dark:border-slate-200 overflow-hidden opacity-60">
                           {album.photos[2] && <AppImage src={album.photos[2].url} fill sizes="(min-width: 1024px) 300px, 85vw" className="w-full h-full object-cover grayscale blur-[2px]" alt="" />}
                        </div>
                        <div className="absolute inset-0 bg-slate-200 dark:bg-slate-600 rounded-[4px] shadow-lg transform -rotate-3 -translate-x-2 -translate-y-1 group-hover:-rotate-6 group-hover:-translate-x-4 transition-all duration-500 border-[6px] border-white dark:border-slate-200 overflow-hidden opacity-80 z-10">
                           {album.photos[1] && <AppImage src={album.photos[1].url} fill sizes="(min-width: 1024px) 300px, 85vw" className="w-full h-full object-cover grayscale-[50%]" alt="" />}
                        </div>
                        <div className="absolute inset-0 bg-white dark:bg-slate-200 rounded-[4px] shadow-2xl border-[6px] border-white dark:border-slate-200 overflow-hidden z-20 transform group-hover:-translate-y-1.5 transition-all duration-500 relative">
                          <AppImage src={album.cover} alt={album.title} fill sizes="(min-width: 1024px) 300px, 85vw" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-4">
                            <span className="text-white font-bold text-base drop-shadow-md translate-y-2 group-hover:translate-y-0 transition-transform duration-500">{album.photos.length} 张照片</span>
                            <span className="text-indigo-300 font-medium text-xs mt-1 drop-shadow-md translate-y-2 group-hover:translate-y-0 transition-transform duration-500 delay-75">点击打开相册</span>
                          </div>
                        </div>
                      </div>

                      <div className="w-full min-w-0 text-center">
                        <h3 className="truncate text-lg font-black tracking-tight text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">{album.title}</h3>
                        <p className="mt-0.5 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                          {album.date}{album.date && ' · '}{album.photos.length} 张
                        </p>
                        {album.description && (
                          <p className="mt-2 line-clamp-1 text-sm text-slate-600 dark:text-slate-300">{album.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {query && matchedAlbums.length === 0 && matchedPhotos.length === 0 && (
                <EmptyState
                  icon={<SearchX size={30} />}
                  title={`没有找到「${query}」相关的照片`}
                  description="换个关键词试试，相册名、相册介绍和照片描述都能搜。"
                  action={
                    <button type="button" onClick={() => setSearchQuery('')} className={PRIMARY_BUTTON}>
                      清空搜索
                    </button>
                  }
                />
              )}
            </div>
          </div>
        )}

        {currentAlbum && (
          <div className="animate-fade-in-up">
            <PageHeader
              icon={<Images size={30} />}
              title={currentAlbum.title}
              subtitle={currentAlbum.description || undefined}
              actions={
                <button
                  type="button"
                  onClick={closeAlbum}
                  className="glass-chip group inline-flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 transition-colors duration-300 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                >
                  <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" aria-hidden="true" />
                  返回画廊
                </button>
              }
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                {currentAlbum.date && (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <CalendarDays size={15} aria-hidden="true" /> {currentAlbum.date}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <ImageIcon size={15} aria-hidden="true" />
                  共 <span className="font-bold tabular-nums text-indigo-500 dark:text-indigo-400">{currentAlbum.photos.length}</span> 个瞬间
                </span>
              </div>
            </PageHeader>

            {currentAlbum.photos.length === 0 ? (
              <EmptyState
                className="mt-8"
                icon={<ImageIcon size={30} />}
                title="这个相册还没有照片"
                description="在后台「相册」里给它添加几张吧。"
              />
            ) : (
              <div ref={albumGridRef} className="relative mt-8">
                <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
                  {currentAlbum.photos.map((photo, index) => (
                    <button
                      type="button"
                      key={`${photo.url}-${index}`}
                      data-photo-index={index}
                      aria-label={`查看大图：${photo.caption || `第 ${index + 1} 张`}`}
                      onClick={(e) => openPhoto('album', index, e.currentTarget)}
                      className="block w-full text-left break-inside-avoid relative group rounded-2xl overflow-hidden cursor-zoom-in shadow-lg bg-white/20 dark:bg-slate-800/20 border border-white/30 dark:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 animate-fade-in-up"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <AppImage data-develop src={photo.url} alt={photo.caption || '照片'} width={800} height={600} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-5">
                        {photo.caption && (
                          <span data-photo-caption className="block text-white font-medium text-sm drop-shadow-md translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                            {photo.caption}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <Viewfinder
                  captions={currentAlbum.photos.map((p) => p.caption)}
                  albumTitle={currentAlbum.title}
                  date={currentAlbum.date}
                />
              </div>
            )}
          </div>
        )}

      </div>

      {lightbox && (
        <Lightbox
          photos={lightbox.scope === 'album' ? albumPhotos : searchPhotos}
          startIndex={lightbox.index}
          zoomed={lightbox.zoomed}
          getThumb={getLightboxThumb}
          onClose={closeLightbox}
        />
      )}

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}
