// lib/epub/library.ts —— 本地 EPUB 书架（只存在读者自己的浏览器 IndexedDB 里，不上传、不同步）
//
// 打开过的 EPUB 文件原样存一份，下次点一下就能接着读，不用重新选文件。
// 隐私模式、存储已满或浏览器禁用存储时，所有操作静默失败，阅读本身不受影响。

export interface LocalBook {
  id: string;
  title: string;
  author: string;
  size: number;
  addedAt: number;
  openedAt: number;
  file: Blob;
  cover: Blob | null;
}

export interface EpubProgress {
  /** 第几节（阅读顺序下标） */
  index: number;
  /** 本节已读比例 0~1 */
  ratio: number;
  savedAt: number;
}

const DB_NAME = 'xh-epub-shelf';
const STORE = 'books';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

/** 最近打开的在前 */
export async function listLocalBooks(): Promise<LocalBook[]> {
  try {
    const all = await withStore<LocalBook[]>('readonly', (s) => s.getAll() as IDBRequest<LocalBook[]>);
    return all.sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export async function getLocalBook(id: string): Promise<LocalBook | null> {
  try {
    return (await withStore<LocalBook | undefined>('readonly', (s) => s.get(id) as IDBRequest<LocalBook | undefined>)) ?? null;
  } catch {
    return null;
  }
}

export async function saveLocalBook(book: LocalBook): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => s.put(book));
    return true;
  } catch {
    return false;
  }
}

export async function deleteLocalBook(id: string): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(id));
  } catch {
    /* 忽略 */
  }
  try {
    window.localStorage.removeItem(progressKey(id));
  } catch {
    /* 忽略 */
  }
}

/** 同一个文件得到同一个 id：文件大小 + 开头 256KB 的 SHA-256（不支持时退回文件名 + 大小） */
export async function bookIdOf(file: File | Blob, name: string): Promise<string> {
  try {
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', head);
    const hex = Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
    return `${file.size.toString(36)}-${hex}`;
  } catch {
    return `${file.size.toString(36)}-${encodeURIComponent(name).slice(0, 60)}`;
  }
}

// ============================== 阅读进度（localStorage） ==============================

const progressKey = (id: string): string => `epub-progress:${id}`;

export function loadEpubProgress(id: string): EpubProgress | null {
  try {
    const raw = window.localStorage.getItem(progressKey(id));
    const p = raw ? (JSON.parse(raw) as EpubProgress) : null;
    return p && Number.isInteger(p.index) && typeof p.ratio === 'number' ? p : null;
  } catch {
    return null;
  }
}

export function saveEpubProgress(id: string, p: EpubProgress): void {
  try {
    window.localStorage.setItem(progressKey(id), JSON.stringify(p));
  } catch {
    /* 忽略 */
  }
}
