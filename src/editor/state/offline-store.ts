// 오프라인 보관함 (재건 3단계 D6): IndexedDB에 글당 1칸
// - 저장 요청이 네트워크 때문에 실패하면 마지막 초안을 여기 둔다. 온라인이 되면 보내고 지운다.
// - 열 때 그 글의 칸이 있으면 "이어 쓰기 / 버리기"를 묻는다.
// - 테스트는 fake-indexeddb의 IDBFactory를 넣는다.

import type { DraftInput } from '@/lib/entry-rules';

export const OFFLINE_DB_NAME = 'cruz-lab-editor';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

export interface OfflineDraft {
  id: string;
  baseVersion: number;
  draft: DraftInput;
  savedAt: string;
}

// IDB 요청을 Promise로 감싼다
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 요청 실패'));
  });
}

// 데이터베이스를 연다. 처음이면 drafts 저장소를 만든다
function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(OFFLINE_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB를 열 수 없습니다'));
  });
}

// 저장소에서 한 번 작업한다. 끝나면 연결을 닫는다
async function withStore<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb(factory);
  try {
    const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
    return await requestToPromise(run(store));
  } finally {
    db.close();
  }
}

// 기본 팩토리는 브라우저의 indexedDB다
function defaultFactory(): IDBFactory {
  if (typeof indexedDB === 'undefined') throw new Error('이 환경에는 IndexedDB가 없습니다');
  return indexedDB;
}

// 글 하나의 보관 초안을 넣는다(있으면 덮는다)
export async function putOfflineDraft(
  entry: OfflineDraft,
  factory: IDBFactory = defaultFactory(),
): Promise<void> {
  await withStore(factory, 'readwrite', (store) => store.put(entry));
}

// 글 하나의 보관 초안. 없으면 null
export async function getOfflineDraft(
  id: string,
  factory: IDBFactory = defaultFactory(),
): Promise<OfflineDraft | null> {
  const result = await withStore(
    factory,
    'readonly',
    (store) => store.get(id) as IDBRequest<OfflineDraft | undefined>,
  );
  return result ?? null;
}

// 글 하나의 보관 초안을 지운다
export async function deleteOfflineDraft(
  id: string,
  factory: IDBFactory = defaultFactory(),
): Promise<void> {
  await withStore(factory, 'readwrite', (store) => store.delete(id));
}

// 보관 초안이 있는 글 ID 목록 (5단계 D11 알림 띠 "이 기기에 보내지 않은 초안 N편")
export async function listOfflineDraftIds(factory: IDBFactory = defaultFactory()): Promise<string[]> {
  const keys = await withStore(factory, 'readonly', (store) => store.getAllKeys());
  return keys.filter((key): key is string => typeof key === 'string');
}
