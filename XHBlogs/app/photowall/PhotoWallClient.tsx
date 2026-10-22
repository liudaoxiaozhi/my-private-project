"use client";

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Image as ImageIcon, Images, Search, SearchX, X } from 'lucide-react';
import { albums, Album } from '../../data/albums';
import AppImage from '../../components/AppImage';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';

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

export default function PhotoWallClient() {
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [selectedImage, setSelectedImage] = useState<{url: string, caption?: string} | null>(null);

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

  const openAlbum = (album: Album) => { setSearchQuery(''); setCurrentAlbum(album); };

  return (
    <div className="min-h-screen relative pb-24">
      <div className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-4 md:mt-28 sm:px-6">

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
                  <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
                    {matchedPhotos.map((photo, index) => (
                      <div data-reveal
                        key={`search-photo-${index}`}
                        onClick={() => setSelectedImage(photo)}
                        className="break-inside-avoid relative group rounded-2xl overflow-hidden cursor-zoom-in shadow-lg bg-white/20 dark:bg-slate-800/20 border border-white/30 dark:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20"
                      >
                        <AppImage src={photo.url} alt={photo.caption || '照片'} width={800} height={600} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-5">
                          <span className="text-indigo-300 font-bold text-xs mb-1 drop-shadow-md">{photo.albumName}</span>
                          <p className="text-white font-medium text-sm drop-shadow-md translate-y-4 group-hover:translate-y-0 transition-transform duration-500">{photo.caption}</p>
                        </div>
                      </div>
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
                  onClick={() => setCurrentAlbum(null)}
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
              <div className="mt-8 columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
                {currentAlbum.photos.map((photo, index) => (
                  <div
                    key={`${photo.url}-${index}`}
                    onClick={() => setSelectedImage(photo)}
                    className="break-inside-avoid relative group rounded-2xl overflow-hidden cursor-zoom-in shadow-lg bg-white/20 dark:bg-slate-800/20 border border-white/30 dark:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/20 animate-fade-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <AppImage src={photo.url} alt={photo.caption || '照片'} width={800} height={600} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-5">
                      {photo.caption && (
                        <p className="text-white font-medium text-sm drop-shadow-md translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                          {photo.caption}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-10 cursor-zoom-out animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <button type="button" aria-label="关闭" className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full p-2">
            <X size={24} aria-hidden="true" />
          </button>

          {/* 灯箱展示原图，刻意保留原生 <img>，不经过尺寸压缩 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedImage.url}
            alt={selectedImage.caption || '全屏照片'}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {selectedImage.caption && (
            <div className="absolute bottom-10 mx-4 px-6 py-3 bg-white/10 backdrop-blur-md border border-white/10 rounded-full text-white text-sm font-medium tracking-wide shadow-2xl">
              {selectedImage.caption}
            </div>
          )}
        </div>
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
