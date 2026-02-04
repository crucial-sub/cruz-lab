// 오프라인 포스트 캐싱
// IndexedDB를 활용한 포스트 로컬 저장
import { openDB, type IDBPDatabase } from 'idb';
import type { Post } from './posts';

const DB_NAME = 'cruz-lab-offline';
const DB_VERSION = 1;
const POSTS_STORE = 'posts';
const META_STORE = 'meta';

type OfflineDB = IDBPDatabase<{
  posts: {
    key: string;
    value: Post & { cachedAt: number };
  };
  meta: {
    key: string;
    value: { lastSync: number };
  };
}>;

let dbPromise: Promise<OfflineDB> | null = null;

/**
 * IndexedDB 초기화
 */
async function getDB(): Promise<OfflineDB> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB는 클라이언트에서만 사용 가능합니다.');
  }

  if (!dbPromise) {
    dbPromise = openDB<{
      posts: {
        key: string;
        value: Post & { cachedAt: number };
      };
      meta: {
        key: string;
        value: { lastSync: number };
      };
    }>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // 포스트 저장소
        if (!db.objectStoreNames.contains(POSTS_STORE)) {
          db.createObjectStore(POSTS_STORE, { keyPath: 'id' });
        }
        // 메타 정보 저장소
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      },
    });
  }

  return dbPromise;
}

/**
 * 포스트를 IndexedDB에 캐시
 */
export async function cachePost(post: Post): Promise<void> {
  const db = await getDB();
  const cachedPost = {
    ...post,
    cachedAt: Date.now(),
    // Date 객체를 타임스탬프로 변환 (IndexedDB 직렬화 호환)
    pubDate: post.pubDate instanceof Date ? post.pubDate : new Date(post.pubDate),
    updatedDate: post.updatedDate instanceof Date ? post.updatedDate : new Date(post.updatedDate),
  };
  await db.put(POSTS_STORE, cachedPost as Post & { cachedAt: number });
}

/**
 * 여러 포스트를 한번에 캐시
 */
export async function cachePosts(posts: Post[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(POSTS_STORE, 'readwrite');

  await Promise.all([
    ...posts.map((post) => {
      const cachedPost = {
        ...post,
        cachedAt: Date.now(),
        pubDate: post.pubDate instanceof Date ? post.pubDate : new Date(post.pubDate),
        updatedDate: post.updatedDate instanceof Date ? post.updatedDate : new Date(post.updatedDate),
      };
      return tx.store.put(cachedPost as Post & { cachedAt: number });
    }),
    tx.done,
  ]);
}

/**
 * 캐시된 포스트 가져오기
 */
export async function getCachedPost(id: string): Promise<Post | null> {
  try {
    const db = await getDB();
    const cached = await db.get(POSTS_STORE, id);
    if (!cached) return null;

    // Date 객체 복원
    return {
      ...cached,
      pubDate: new Date(cached.pubDate),
      updatedDate: new Date(cached.updatedDate),
    };
  } catch {
    return null;
  }
}

/**
 * slug로 캐시된 포스트 가져오기
 */
export async function getCachedPostBySlug(slug: string): Promise<Post | null> {
  try {
    const db = await getDB();
    const allPosts = await db.getAll(POSTS_STORE);
    const cached = allPosts.find((p) => p.slug === slug);
    if (!cached) return null;

    return {
      ...cached,
      pubDate: new Date(cached.pubDate),
      updatedDate: new Date(cached.updatedDate),
    };
  } catch {
    return null;
  }
}

/**
 * 모든 캐시된 포스트 가져오기
 */
export async function getAllCachedPosts(): Promise<Post[]> {
  try {
    const db = await getDB();
    const allPosts = await db.getAll(POSTS_STORE);

    return allPosts
      .map((cached) => ({
        ...cached,
        pubDate: new Date(cached.pubDate),
        updatedDate: new Date(cached.updatedDate),
      }))
      .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  } catch {
    return [];
  }
}

/**
 * 마지막 동기화 시간 업데이트
 */
export async function updateLastSync(): Promise<void> {
  const db = await getDB();
  await db.put(META_STORE, { lastSync: Date.now() }, 'sync');
}

/**
 * 마지막 동기화 시간 가져오기
 */
export async function getLastSync(): Promise<number | null> {
  try {
    const db = await getDB();
    const meta = await db.get(META_STORE, 'sync');
    return meta?.lastSync || null;
  } catch {
    return null;
  }
}

/**
 * 온라인 상태 확인
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

/**
 * 네트워크 상태 변경 리스너
 */
export function onNetworkChange(callback: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
