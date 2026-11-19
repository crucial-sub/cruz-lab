// 폰 저장 (서가 2단계 T5, Plan J37~J39)
// - 새 판(origin 'phone') = 새 index.md + 앞 판의 나머지 파일(버킷 안 복사).
// - 판을 바꾸기 직전에 md 판이 baseRev가 아니면(또는 그사이 다른 판 번호가 매겨졌으면) 새 판을 지우고 409 REV_CHANGED.
// - 저장소는 메모리 저장소(PhoneEditDeps 가짜)다. 판 기록·문서 기록·버킷 파일을 한 곳에 둔다.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/server/api-response';
import { MAX_PHONE_TEXT_BYTES, savePhoneEditWith, type PhoneEditDeps } from '@/library/server/edit';
import type { LibraryDoc, Revision } from '@/library/server/store';

const DOC = 'doc123abc';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const BASE_TEXT = '# 처음 제목\n\n맥에서 쓴 글\n\n![그림](img/a.png)\n';
const MD_TYPE = 'text/markdown; charset=utf-8';

type Step = 'copy' | 'activate';

// 메모리 저장소
// - hooks[단계]: 그 단계 직전에 한 번 부른다(그사이 맥 올리기가 끝난 경우 등을 흉내 낸다)
// - failCopy: 복사가 실패한다
function fakeStore(options: { doc?: Partial<LibraryDoc>; baseOrigin?: Revision['origin'] } = {}) {
  const base: Revision = {
    format: 'md',
    origin: options.baseOrigin ?? 'mac',
    status: 'ready',
    files: [
      { path: 'index.md', contentType: MD_TYPE, bytes: Buffer.byteLength(BASE_TEXT), sha256: sha(BASE_TEXT) },
      { path: 'img/a.png', contentType: 'image/png', bytes: 3, sha256: sha('png') },
    ],
    fileName: '2026-11-19-노트.md',
    createdAt: new Date('2026-11-19T00:00:00Z'),
  };
  const doc: LibraryDoc = {
    key: 'mac:~/projects/p/2026-11-19-노트',
    sourcePath: '~/projects/p/2026-11-19-노트.md',
    project: 'p',
    title: '처음 제목',
    docDate: '2026-11-19',
    formats: { md: { rev: 2, entry: 'index.md', bytes: Buffer.byteLength(BASE_TEXT) + 3, fileCount: 2 } },
    lastRev: 2,
    readAt: new Date('2026-11-19T01:00:00Z'),
    uploadedAt: new Date('2026-11-19T00:00:00Z'),
    updatedAt: new Date('2026-11-19T00:00:00Z'),
    ...options.doc,
  };
  const state = {
    doc: doc as LibraryDoc | null,
    revisions: new Map<number, Revision>([[2, base]]),
    files: new Map<string, { text: string; contentType: string }>([
      [`${DOC}/2/index.md`, { text: BASE_TEXT, contentType: MD_TYPE }],
      [`${DOC}/2/img/a.png`, { text: 'png', contentType: 'image/png' }],
    ]),
    search: [] as { rev: number; title: string; text: string }[],
    invalidated: 0,
  };
  const hooks: Partial<Record<Step, () => void>> = {};
  const runHook = (step: Step) => {
    const hook = hooks[step];
    delete hooks[step];
    hook?.();
  };
  let failCopy = false;
  const deps: PhoneEditDeps = {
    now: () => new Date('2026-11-20T00:00:00Z'),
    loadDoc: async (id) => (id === DOC && state.doc?.formats.md ? structuredClone(state.doc) : id === DOC ? state.doc : null),
    loadRevision: async (id, rev) => (id === DOC ? (state.revisions.get(rev) ?? null) : null),
    createPendingRevision: async (_id, revision) => {
      if (!state.doc) throw new Error('문서 없음');
      state.doc.lastRev += 1;
      state.revisions.set(state.doc.lastRev, revision);
      return state.doc.lastRev;
    },
    writeEntry: async (_id, rev, path, bytes, contentType) => {
      state.files.set(`${DOC}/${rev}/${path}`, { text: Buffer.from(bytes).toString('utf8'), contentType });
    },
    copyFile: async (_id, fromRev, toRev, path) => {
      runHook('copy');
      const from = state.files.get(`${DOC}/${fromRev}/${path}`);
      if (failCopy || !from) throw new Error(`복사 실패: ${path}`);
      state.files.set(`${DOC}/${toRev}/${path}`, { ...from });
    },
    activate: async (_id, input) => {
      runHook('activate');
      if (!state.doc || !state.doc.formats.md) return 'gone';
      if (state.doc.formats.md.rev !== input.baseRev || state.doc.lastRev !== input.rev) return 'rev-changed';
      state.doc = {
        ...state.doc,
        formats: { ...state.doc.formats, md: input.format },
        title: input.title,
        updatedAt: input.updatedAt,
        mdSync: input.mdSync,
      };
      const revision = state.revisions.get(input.rev);
      if (revision) state.revisions.set(input.rev, { ...revision, status: 'ready' });
      return 'activated';
    },
    deleteRevision: async (_id, rev) => {
      state.revisions.delete(rev);
      for (const name of [...state.files.keys()]) if (name.startsWith(`${DOC}/${rev}/`)) state.files.delete(name);
    },
    invalidate: () => {
      state.invalidated += 1;
    },
    writeSearchIndex: async (_id, input) => {
      state.search.push({ rev: input.rev, title: input.title, text: input.text });
    },
  };
  return {
    state,
    hooks,
    deps,
    setFailCopy: () => {
      failCopy = true;
    },
  };
}

// 던진 ApiError의 상태·코드
async function apiErrorOf(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, code: error.code };
    throw error;
  }
  throw new Error('던지지 않았습니다');
}

const NEW_TEXT = '# 폰에서 고친 제목\n\n폰에서 고친 글\n\n![그림](img/a.png)\n';

describe('savePhoneEditWith: 폰 저장', () => {
  it('새 판(phone)을 만든다: 새 index.md + 앞 판 그림 복사, 판을 바꾸고 앞 판을 지운다', async () => {
    const { state, deps } = fakeStore();

    const result = await savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT });

    expect(result).toEqual({ changed: true, rev: 3 });
    const revision = state.revisions.get(3);
    expect(revision).toMatchObject({ format: 'md', origin: 'phone', status: 'ready', fileName: '2026-11-19-노트.md' });
    expect(revision?.files).toEqual([
      { path: 'index.md', contentType: MD_TYPE, bytes: Buffer.byteLength(NEW_TEXT), sha256: sha(NEW_TEXT) },
      { path: 'img/a.png', contentType: 'image/png', bytes: 3, sha256: sha('png') },
    ]);
    expect(state.files.get(`${DOC}/3/index.md`)).toEqual({ text: NEW_TEXT, contentType: MD_TYPE });
    expect(state.files.get(`${DOC}/3/img/a.png`)?.text).toBe('png');
    expect(state.doc?.formats.md).toEqual({ rev: 3, entry: 'index.md', bytes: Buffer.byteLength(NEW_TEXT) + 3, fileCount: 2 });
    // 앞 판(2)의 파일과 기록을 지웠다 (J9)
    expect(state.revisions.has(2)).toBe(false);
    expect([...state.files.keys()].filter((name) => name.startsWith(`${DOC}/2/`))).toEqual([]);
    expect(state.invalidated).toBeGreaterThan(0);
  });

  it('제목을 다시 뽑고, 읽음은 그대로 둔다(새로 올린 문서로 되돌리지 않는다, J38)', async () => {
    const { state, deps } = fakeStore();
    await savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT });
    expect(state.doc?.title).toBe('폰에서 고친 제목');
    expect(state.doc?.readAt).toEqual(new Date('2026-11-19T01:00:00Z'));
    expect(state.doc?.uploadedAt).toEqual(new Date('2026-11-19T00:00:00Z'));
    expect(state.doc?.updatedAt).toEqual(new Date('2026-11-20T00:00:00Z'));
  });

  it('색인을 새 판 글로 다시 쓴다 (J26·J38)', async () => {
    const { state, deps } = fakeStore();
    await savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT });
    expect(state.search).toEqual([{ rev: 3, title: '폰에서 고친 제목', text: NEW_TEXT }]);
  });

  it('1단계 문서(mdSync 없음)이고 앞 판이 맥 판이면 앞 판 index.md 해시로 원본 해시를 채운다 (J39)', async () => {
    const { state, deps } = fakeStore();
    await savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT });
    expect(state.doc?.mdSync).toEqual({ macSha256: sha(BASE_TEXT), pendingRev: 3 });
  });

  it('이미 아는 원본 해시는 그대로 둔다', async () => {
    const known = 'f'.repeat(64);
    const { state, deps } = fakeStore({ doc: { mdSync: { macSha256: known, pendingRev: null } } });
    await savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT });
    expect(state.doc?.mdSync).toEqual({ macSha256: known, pendingRev: 3 });
  });

  it('글이 앞 판과 같으면 새 판을 만들지 않는다', async () => {
    const { state, deps } = fakeStore();
    const result = await savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: BASE_TEXT });
    expect(result).toEqual({ changed: false, rev: 2 });
    expect(state.doc?.lastRev).toBe(2);
    expect([...state.revisions.keys()]).toEqual([2]);
    expect(state.doc?.mdSync).toBeUndefined();
  });
});

describe('savePhoneEditWith: 덮어쓰지 않는다 (409 REV_CHANGED)', () => {
  it('처음부터 md 판이 baseRev가 아니면 409이고 아무것도 만들지 않는다', async () => {
    const { state, deps } = fakeStore();
    expect(await apiErrorOf(savePhoneEditWith(deps, { docId: DOC, baseRev: 1, text: NEW_TEXT }))).toEqual({
      status: 409,
      code: 'REV_CHANGED',
    });
    expect(state.doc?.lastRev).toBe(2);
    expect([...state.revisions.keys()]).toEqual([2]);
  });

  it('저장하는 사이 맥에서 새 판이 오면(판 바꾸기 직전 md 판 ≠ baseRev) 새 판을 지우고 409', async () => {
    const { state, hooks, deps } = fakeStore();
    hooks.activate = () => {
      // 그사이 맥 올리기가 판 4를 마무리했다
      const doc = state.doc as LibraryDoc;
      doc.lastRev = 4;
      doc.formats.md = { rev: 4, entry: 'index.md', bytes: 10, fileCount: 1 };
    };

    expect(await apiErrorOf(savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT }))).toEqual({
      status: 409,
      code: 'REV_CHANGED',
    });
    // 폰 판(3)의 기록과 파일이 없다. 문서는 맥 판 그대로다
    expect(state.revisions.has(3)).toBe(false);
    expect([...state.files.keys()].filter((name) => name.startsWith(`${DOC}/3/`))).toEqual([]);
    expect(state.doc?.formats.md?.rev).toBe(4);
    expect(state.doc?.mdSync).toBeUndefined();
    expect(state.search).toEqual([]);
  });

  it('저장하는 사이 다른 올리기가 판 번호를 받으면(md 판은 그대로) 새 판을 지우고 409', async () => {
    const { state, hooks, deps } = fakeStore();
    hooks.activate = () => {
      ;(state.doc as LibraryDoc).lastRev += 1;
    };
    expect(await apiErrorOf(savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT }))).toEqual({
      status: 409,
      code: 'REV_CHANGED',
    });
    expect(state.revisions.has(3)).toBe(false);
    expect(state.doc?.formats.md?.rev).toBe(2);
    // 앞 판은 그대로 남는다
    expect(state.files.get(`${DOC}/2/index.md`)?.text).toBe(BASE_TEXT);
  });

  it('복사하는 사이 앞 판이 지워졌으면(맥 판이 마무리됨) 새 판을 지우고 409', async () => {
    const { state, hooks, deps } = fakeStore();
    hooks.copy = () => {
      const doc = state.doc as LibraryDoc;
      doc.lastRev = 4;
      doc.formats.md = { rev: 4, entry: 'index.md', bytes: 10, fileCount: 1 };
      state.files.delete(`${DOC}/2/img/a.png`);
    };
    expect(await apiErrorOf(savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT }))).toEqual({
      status: 409,
      code: 'REV_CHANGED',
    });
    expect(state.revisions.has(3)).toBe(false);
    expect([...state.files.keys()].filter((name) => name.startsWith(`${DOC}/3/`))).toEqual([]);
  });

  it('판은 그대로인데 복사가 실패하면 새 판을 지우고 오류를 던진다(500)', async () => {
    const { state, deps, setFailCopy } = fakeStore();
    setFailCopy();
    await expect(savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT })).rejects.toThrow('복사 실패');
    expect(state.revisions.has(3)).toBe(false);
    expect([...state.files.keys()].filter((name) => name.startsWith(`${DOC}/3/`))).toEqual([]);
    expect(state.doc?.formats.md?.rev).toBe(2);
  });
});

describe('savePhoneEditWith: 받지 않는 요청', () => {
  it('글이 2 MB를 넘으면 413', async () => {
    const { deps } = fakeStore();
    const text = 'ㄱ'.repeat(Math.ceil(MAX_PHONE_TEXT_BYTES / 3) + 1);
    expect(await apiErrorOf(savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text }))).toEqual({
      status: 413,
      code: 'TEXT_TOO_LARGE',
    });
  });

  it('md 판이 없는 문서(html만)는 404', async () => {
    const { deps } = fakeStore({
      doc: { formats: { html: { rev: 2, entry: 'index.html', bytes: 10, fileCount: 1 } } },
    });
    expect(await apiErrorOf(savePhoneEditWith(deps, { docId: DOC, baseRev: 2, text: NEW_TEXT }))).toEqual({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('없는 문서는 404', async () => {
    const { deps } = fakeStore();
    expect(await apiErrorOf(savePhoneEditWith(deps, { docId: 'other123', baseRev: 2, text: NEW_TEXT }))).toEqual({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
