// 문서 출처의 운영 의존성 테스트 (PR #35 리뷰 의견)
// - primeStream: 저장소 파일의 첫 조각을 먼저 읽는다. 파일이 없으면 여기서 던져 처리기가 404를 준다(200 + 끊긴 본문이 아니다).
// - loadRawDocStateWith: 문서가 가리킨 판이 사라졌거나 준비 전이면 문서를 다시 읽는다(새 판이 막 들어온 경우). 두 번까지만.
import { describe, expect, it } from 'vitest';
import { loadRawDocStateWith, primeStream } from '@/library/server/raw';
import type { LibraryDoc, Revision } from '@/library/server/store';

const bytes = (text: string) => new TextEncoder().encode(text);

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe('primeStream', () => {
  it('첫 조각과 나머지를 그대로 넘긴다', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('가나'));
        controller.enqueue(bytes('다'));
        controller.close();
      },
    });
    expect(await readAll(await primeStream(source))).toBe('가나다');
  });

  it('빈 파일이면 바로 닫히는 흐름을 준다', async () => {
    const source = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });
    expect(await readAll(await primeStream(source))).toBe('');
  });

  it('첫 읽기가 실패하면(저장소에 파일이 없음) 던진다', async () => {
    const source = new ReadableStream<Uint8Array>({
      pull: () => Promise.reject(new Error('No such object')),
    });
    await expect(primeStream(source)).rejects.toThrow('No such object');
  });

  it('받는 쪽이 취소하면 원래 흐름도 취소한다', async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start: (controller) => controller.enqueue(bytes('a')),
      cancel: () => {
        cancelled = true;
      },
    });
    const primed = await primeStream(source);
    await primed.cancel();
    expect(cancelled).toBe(true);
  });
});

// 가짜 저장소: 문서 읽기 차례마다 다른 값을 준다
function store(docs: Array<LibraryDoc | null>, revisions: Record<number, Revision | null>) {
  let reads = 0;
  return {
    reads: () => reads,
    deps: {
      getDoc: async () => docs[Math.min(reads++, docs.length - 1)],
      getRevision: async (_docId: string, rev: number) => revisions[rev] ?? null,
    },
  };
}

const AT = new Date(Date.UTC(2026, 10, 18));
function doc(htmlRev: number): LibraryDoc {
  return {
    key: 'web:t:x',
    sourcePath: null,
    project: 't',
    title: 'x',
    docDate: null,
    formats: { html: { rev: htmlRev, entry: 'index.html', bytes: 1, fileCount: 1 } },
    lastRev: htmlRev,
    readAt: null,
    uploadedAt: AT,
    updatedAt: AT,
  };
}
function revision(status: Revision['status']): Revision {
  return {
    format: 'html',
    origin: 'web',
    status,
    files: [{ path: 'index.html', contentType: 'text/html; charset=utf-8', bytes: 1, sha256: 'a'.repeat(64) }],
    fileName: 'x.html',
    createdAt: AT,
  };
}

describe('loadRawDocStateWith', () => {
  it('지금 판의 파일 목록을 준다', async () => {
    const s = store([doc(7)], { 7: revision('ready') });
    const state = await loadRawDocStateWith(s.deps, 'a1b2c3d4e5f6a7b8c9d0');
    expect(state?.html?.rev).toBe(7);
    expect([...(state?.html?.files.keys() ?? [])]).toEqual(['index.html']);
  });

  it('읽는 사이 판 7이 지워지고 판 8이 들어오면 문서를 다시 읽어 판 8을 준다', async () => {
    const s = store([doc(7), doc(8)], { 7: null, 8: revision('ready') });
    const state = await loadRawDocStateWith(s.deps, 'a1b2c3d4e5f6a7b8c9d0');
    expect(state?.html?.rev).toBe(8);
    expect(s.reads()).toBe(2);
  });

  it('문서가 지워졌으면 null이다', async () => {
    const s = store([doc(7), null], { 7: null });
    expect(await loadRawDocStateWith(s.deps, 'a1b2c3d4e5f6a7b8c9d0')).toBeNull();
  });

  it('판이 계속 없으면 문서를 세 번까지 읽고 null이다', async () => {
    const s = store([doc(7)], { 7: null });
    expect(await loadRawDocStateWith(s.deps, 'a1b2c3d4e5f6a7b8c9d0')).toBeNull();
    expect(s.reads()).toBe(3);
  });
});
