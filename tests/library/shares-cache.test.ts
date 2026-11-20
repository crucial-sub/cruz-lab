// 공유 서버의 메모리 캐시 테스트 (서가 2단계 PR-C 검토 중요 1·2)
// - 중요 1: 문서 출처의 공유 확인(checkShareAccess, 60초)이 메모리에 둔 공유 기록(60초)을 다시 쓰면 두 캐시가 겹쳐
//   끈 공유가 다른 서버에서 최대 약 2분 열린다. 공유 확인은 공유 기록을 저장소에서 새로 읽어야 한다(겹침 없이 1분 안).
// - 중요 2: 로그아웃 묶음 목록은 그 프로젝트 문서만 읽고(where project ==), 같은 프로젝트 목록은 메모리에 60초 둔다.
// - Firestore는 메모리 가짜로 바꾼다(firebase-server의 getServerDb).
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeDoc {
  data: Record<string, unknown>;
}

const collections = new Map<string, Map<string, FakeDoc>>();
const reads: string[] = [];

function snapshot(name: string, id: string) {
  const found = collections.get(name)?.get(id);
  return { id, exists: Boolean(found), data: () => found?.data };
}

const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      get: async () => {
        reads.push(`get ${name}/${id}`);
        return snapshot(name, id);
      },
    }),
    where: (field: string, op: string, value: unknown) => ({
      get: async () => {
        reads.push(`query ${name} ${field}${op}${String(value)}`);
        const docs = [...(collections.get(name) ?? new Map()).entries()]
          .filter(([, doc]) => doc.data[field] === value)
          .map(([id]) => snapshot(name, id));
        return { docs };
      },
    }),
  }),
};

vi.mock('@/lib/server/firebase-server', () => ({ getServerDb: () => fakeDb, getServerStorage: () => ({}) }));

const { invalidateMemo } = await import('@/lib/server/memo-cache');
const { checkShareAccess, firestoreShareDeps } = await import('@/library/server/shares');

const NOW = new Date();
const SHARE = 'AbCdEfGhIjKlMnOpQrStUv_-';
const DOC = 'aaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbb';
const CRUZ = 'cccccccccccccccccccc';
const MD = { rev: 1, entry: 'index.md', bytes: 1, fileCount: 1 };

function libraryDoc(key: string, project: string, title: string) {
  return { key, sourcePath: null, project, title, docDate: null, formats: { md: MD }, lastRev: 1, readAt: null, uploadedAt: NOW, updatedAt: NOW };
}

function put(name: string, id: string, data: Record<string, unknown>) {
  if (!collections.has(name)) collections.set(name, new Map());
  collections.get(name)!.set(id, { data });
}

beforeEach(() => {
  collections.clear();
  reads.length = 0;
  invalidateMemo();
  put('library_docs', DOC, libraryDoc('mac:~/projects/p/a/x', 'p', '문서 X'));
  put('library_docs', OTHER, libraryDoc('mac:~/projects/p/b/y', 'p', '문서 Y'));
  put('library_docs', CRUZ, libraryDoc('mac:~/projects/cruz/z', 'cruz', '문서 Z'));
  put('library_shares', SHARE, { scope: { kind: 'project', project: 'p' }, expiresAt: null, revokedAt: null, createdAt: NOW });
});

describe('중요 1: 끈 공유는 다른 서버에서도 1분 안에 막힌다', () => {
  it('다른 요청이 공유 기록을 메모리에 둔 뒤 꺼져도, 새 문서의 공유 확인은 꺼짐을 본다', async () => {
    // 이 서버가 공유 주소 페이지를 그리며 "살아 있음"을 메모리에 둔다
    expect(await firestoreShareDeps.getShare(SHARE)).toMatchObject({ revokedAtMs: null });
    // 다른 서버에서 공유를 끈다(이 서버의 메모리는 비지 않는다)
    put('library_shares', SHARE, { scope: { kind: 'project', project: 'p' }, expiresAt: null, revokedAt: NOW, createdAt: NOW });
    // 처음 묻는 문서의 공유 확인은 저장소에서 새로 읽어 꺼짐을 본다
    expect(await checkShareAccess(SHARE, DOC)).toBeNull();
  });
});

describe('중요 2: 묶음 목록은 그 프로젝트 문서만 읽고, 60초 메모리에 둔다', () => {
  it('프로젝트 조건으로 읽는다(서가 문서 전체를 읽지 않는다)', async () => {
    const docs = await firestoreShareDeps.listDocs('p');
    expect(docs.map((item) => item.id).sort()).toEqual([DOC, OTHER]);
    expect(reads).toEqual(['query library_docs project==p']);
  });

  it('같은 프로젝트를 다시 물으면 저장소를 읽지 않는다', async () => {
    await firestoreShareDeps.listDocs('p');
    await firestoreShareDeps.listDocs('p');
    expect(reads.filter((line) => line.startsWith('query'))).toHaveLength(1);
  });
});
