// 서가 내리기 순서와 실패 복구 (PR #35 리뷰 의견 1·2, 사용자 결정 2026-11-18 "가. 순서 바꾸기")
// - 판 파일 → 판 기록 → 문서 기록 순서로 지운다. 문서 기록을 마지막에 지워서 판 번호 셈값이 끝까지 남는다.
// - 중간에 실패하면 던지고 뒤 단계를 하지 않는다. 문서 기록이 남아 다시 내리기가 남은 것을 이어 지운다.
import { describe, expect, it } from 'vitest';
import { removeLibraryDocWith, type RemoveDocDeps } from '@/library/server/store';

// 메모리 저장소: 문서 기록, 판 기록, 판 파일. fail에 단계 이름을 넣으면 그 단계가 한 번 실패한다
function fakeStore(docId: string) {
  const state = {
    doc: true,
    revisions: new Set(['1', '2', '3']),
    files: new Set([`${docId}/2/index.html`, `${docId}/3/index.html`, `${docId}/3/img/a.png`, 'other/1/index.html']),
    invalidated: 0,
    // 서가 2단계 J26: 검색 색인(library_search/{문서 id})
    searchIndex: true,
  };
  const fail = new Set<'files' | 'revisions' | 'search' | 'doc'>();
  const once = (step: 'files' | 'revisions' | 'search' | 'doc') => {
    if (!fail.has(step)) return;
    fail.delete(step);
    throw new Error(`${step} 삭제 실패`);
  };
  const deps: RemoveDocDeps = {
    docExists: async (id) => id === docId && state.doc,
    deleteFiles: async (prefix) => {
      once('files');
      for (const name of [...state.files]) if (name.startsWith(prefix)) state.files.delete(name);
    },
    deleteRevisionRecords: async () => {
      once('revisions');
      state.revisions.clear();
    },
    deleteSearchIndex: async () => {
      once('search');
      state.searchIndex = false;
    },
    deleteDocRecord: async () => {
      once('doc');
      state.doc = false;
    },
    invalidate: () => {
      state.invalidated += 1;
    },
  };
  return { state, fail, deps };
}

const DOC = 'abc123';

describe('removeLibraryDocWith', () => {
  it('문서가 없으면 false를 주고 아무것도 지우지 않는다', async () => {
    const { state, deps } = fakeStore(DOC);
    expect(await removeLibraryDocWith(deps, 'missing')).toBe(false);
    expect(state.files.size).toBe(4);
    expect(state.revisions.size).toBe(3);
  });

  it('판 파일, 판 기록, 문서 기록을 모두 지우고 true를 준다. 다른 문서의 파일은 남긴다', async () => {
    const { state, deps } = fakeStore(DOC);
    expect(await removeLibraryDocWith(deps, DOC)).toBe(true);
    expect([...state.files]).toEqual(['other/1/index.html']);
    expect(state.revisions.size).toBe(0);
    expect(state.doc).toBe(false);
    expect(state.invalidated).toBeGreaterThan(0);
  });

  // 서가 2단계: 내린 문서가 검색에 나오지 않게 색인도 지운다. 문서 기록보다 먼저라서 실패하면 다시 내리기가 이어 지운다
  it('검색 색인을 지운다. 색인 삭제가 실패하면 던지고 문서 기록을 남긴다', async () => {
    const { state, fail, deps } = fakeStore(DOC);
    fail.add('search');
    await expect(removeLibraryDocWith(deps, DOC)).rejects.toThrow('search 삭제 실패');
    expect(state.searchIndex).toBe(true);
    expect(state.doc).toBe(true);
    expect(await removeLibraryDocWith(deps, DOC)).toBe(true);
    expect(state.searchIndex).toBe(false);
    expect(state.doc).toBe(false);
  });

  it('판 파일 삭제가 실패하면 던지고 판 기록과 문서 기록을 남긴다', async () => {
    const { state, fail, deps } = fakeStore(DOC);
    fail.add('files');
    await expect(removeLibraryDocWith(deps, DOC)).rejects.toThrow('files 삭제 실패');
    expect(state.revisions.size).toBe(3);
    expect(state.doc).toBe(true);
  });

  it('판 기록 삭제가 실패하면 던지고 문서 기록을 남긴다', async () => {
    const { state, fail, deps } = fakeStore(DOC);
    fail.add('revisions');
    await expect(removeLibraryDocWith(deps, DOC)).rejects.toThrow('revisions 삭제 실패');
    expect(state.doc).toBe(true);
  });

  it('실패한 뒤 다시 내리면 남은 것을 이어 지운다 (404가 아니다)', async () => {
    const { state, fail, deps } = fakeStore(DOC);
    fail.add('revisions');
    await expect(removeLibraryDocWith(deps, DOC)).rejects.toThrow();
    expect(await removeLibraryDocWith(deps, DOC)).toBe(true);
    expect(state.revisions.size).toBe(0);
    expect(state.doc).toBe(false);
    expect([...state.files]).toEqual(['other/1/index.html']);
  });

  it('문서 기록 삭제가 실패해도 문서 출처 캐시를 비운다 (파일은 이미 지웠다)', async () => {
    const { state, fail, deps } = fakeStore(DOC);
    fail.add('doc');
    await expect(removeLibraryDocWith(deps, DOC)).rejects.toThrow('doc 삭제 실패');
    expect(state.invalidated).toBeGreaterThan(0);
  });
});
