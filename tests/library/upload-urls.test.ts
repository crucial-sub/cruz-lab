// 올리기 서명 주소 (PR #35 리뷰 의견 2·3, 사용자 결정 2026-11-18)
// - 의견 3 "가. 덮어쓰기 막기": 서명 PUT에 "없을 때만 만들기" 조건(x-goog-if-generation-match: 0)을 넣는다.
//   마무리 뒤 같은 주소로 다시 보내도 버킷이 412로 거절한다. 입구는 서버가 준 머리를 그대로 보낸다.
// - 의견 1·2 "가. 순서 바꾸기": 새 문서를 처음 만들 때 {문서 id}/ 아래 남은 파일을 먼저 지운다.
//   앞서 내린 문서의 끊긴 올리기가 남긴 파일 때문에 새 판의 PUT이 412가 되지 않게 한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueUploadUrlsWith, type IssueUploadUrlsDeps, type SignWriteOptions } from '@/library/server/uploads';

function fakeDeps(options: { failClean?: boolean } = {}) {
  const log: string[] = [];
  const signed: { name: string; options: SignWriteOptions }[] = [];
  const deps: IssueUploadUrlsDeps = {
    deleteFiles: async (prefix) => {
      log.push(`clean ${prefix}`);
      if (options.failClean) throw new Error('청소 실패');
    },
    signWriteUrl: async (name, signOptions) => {
      log.push(`sign ${name}`);
      signed.push({ name, options: signOptions });
      return `https://bucket.example/${name}?sig=1`;
    },
  };
  return { log, signed, deps };
}

const FILES = [
  { path: 'index.md', contentType: 'text/markdown; charset=utf-8' },
  { path: 'img/a.png', contentType: 'image/png' },
];
const EXPIRES = Date.UTC(2026, 10, 18, 12, 15);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('issueUploadUrlsWith', () => {
  it('새 문서면 {문서 id}/ 아래 남은 파일을 지운 뒤 서명한다', async () => {
    const { log, deps } = fakeDeps();
    await issueUploadUrlsWith(deps, { docId: 'd1', rev: 1, createdDoc: true, files: FILES, expires: EXPIRES });
    expect(log[0]).toBe('clean d1/');
    expect(log.slice(1)).toEqual(['sign d1/1/index.md', 'sign d1/1/img/a.png']);
  });

  it('있던 문서면 파일을 지우지 않는다', async () => {
    const { log, deps } = fakeDeps();
    await issueUploadUrlsWith(deps, { docId: 'd1', rev: 4, createdDoc: false, files: FILES, expires: EXPIRES });
    expect(log.some((line) => line.startsWith('clean'))).toBe(false);
  });

  it('청소가 실패해도 서명 주소를 준다 (남은 파일이 있으면 그 PUT만 412가 된다)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = fakeDeps({ failClean: true });
    const uploads = await issueUploadUrlsWith(deps, { docId: 'd1', rev: 1, createdDoc: true, files: FILES, expires: EXPIRES });
    expect(uploads.map((upload) => upload.path)).toEqual(['index.md', 'img/a.png']);
  });

  it('서명과 입구가 보낼 머리에 "없을 때만 만들기" 조건을 넣는다', async () => {
    const { signed, deps } = fakeDeps();
    const uploads = await issueUploadUrlsWith(deps, { docId: 'd1', rev: 2, createdDoc: false, files: FILES, expires: EXPIRES });
    expect(signed[1]).toEqual({
      name: 'd1/2/img/a.png',
      options: { expires: EXPIRES, contentType: 'image/png', extensionHeaders: { 'x-goog-if-generation-match': '0' } },
    });
    expect(uploads[1]).toEqual({
      path: 'img/a.png',
      url: 'https://bucket.example/d1/2/img/a.png?sig=1',
      headers: { 'Content-Type': 'image/png', 'x-goog-if-generation-match': '0' },
    });
  });
});
