// 서버 메모리 캐시 (TTL + 동시 요청 합치기)
// - 같은 키를 동시에 요청하면 Firestore 조회를 한 번만 한다.
// - 값은 TTL 동안 서버 인스턴스 메모리에 남는다.
// - 글/시리즈를 저장하거나 지울 때 invalidateMemo()로 바로 비운다.

interface MemoEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

const store = new Map<string, MemoEntry<unknown>>();

// 공개 목록 데이터의 기본 유지 시간 (CDN s-maxage와 같은 값)
export const PUBLIC_DATA_TTL_MS = 60_000;

// 키에 해당하는 값을 캐시에서 꺼낸다. 없거나 만료되면 loader를 실행한다.
// - 진행 중인 Promise도 저장하므로 동시 요청은 같은 Promise를 공유한다.
// - loader가 실패하면 캐시에서 지워 다음 요청이 다시 시도하게 한다.
export function memoize<T>(key: string, loader: () => Promise<T>, ttlMs = PUBLIC_DATA_TTL_MS): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as MemoEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.promise;

  const promise = loader().catch((error) => {
    store.delete(key);
    throw error;
  });
  store.set(key, { expiresAt: now + ttlMs, promise });
  return promise;
}

// 접두사가 같은 키를 모두 지운다. 접두사가 없으면 전부 지운다.
export function invalidateMemo(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
