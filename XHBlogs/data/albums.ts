// data/albums.ts —— 照片墙的相册。内容在 albums.json 里，后台「照片墙」改的就是那个文件
import data from './albums.json';

export interface Photo { url: string; caption?: string; }
export interface Album { id: string; title: string; description: string; cover: string; date: string; photos: Photo[]; }

export const albums: Album[] = data;
