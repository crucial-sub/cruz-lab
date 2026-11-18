// 올리기 서명 주소 (PR #35 리뷰 의견 2·3, 사용자 결정 2026-11-18)
// - 의견 3 "가. 덮어쓰기 막기": 서명 PUT에 "없을 때만 만들기" 조건(x-goog-if-generation-match: 0)을 넣는다.
//   마무리 뒤 같은 주소로 다시 보내도 버킷이 412로 거절한다. 입구는 서버가 준 머리를 그대로 보낸다.
// - 의견 1·2 "가. 순서 바꾸기": 서명하기 전에 할당한 판 경로 {문서 id}/{판}/ 아래 남은 파일을 먼저 지운다.
//   앞서 내린 문서의 끊긴 올리기가 남긴 파일 때문에 새 판의 PUT이 412가 되지 않게 한다.
//   처음에는 새 문서일 때 {문서 id}/ 전체를 지웠다. PR #36 리뷰 I4로 자기 판 경로만 지우게 좁혔다.
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
  it('할당한 판 경로 {문서 id}/{판}/ 아래 남은 파일을 지운 뒤 서명한다', async () => {
    const { log, deps } = fakeDeps();
    await issueUploadUrlsWith(deps, { docId: 'd1', rev: 1, files: FILES, expires: EXPIRES });
    expect(log[0]).toBe('clean d1/1/');
    expect(log.slice(1)).toEqual(['sign d1/1/index.md', 'sign d1/1/img/a.png']);
  });

  // PR #36 리뷰(CodeRabbit I4): 같은 새 문서를 두 입구(서가 화면과 맥 입구 등)가 거의 동시에 올리기 시작하면,
  // 문서 전체({문서 id}/)를 지우는 청소가 다른 요청이 이미 올리고 마무리한 판의 파일까지 지운다
  // ("준비됨" 판인데 파일이 없는 상태가 남는다). 판 번호는 트랜잭션이 하나씩만 주므로 자기 판 경로만 지우면 안전하다.
  it('청소는 할당한 판 경로만 지운다. 다른 요청이 먼저 올린 판의 파일은 남긴다', async () => {
    // d1/1/: 앞서 내린 같은 문서가 남긴 파일, d1/2/: 동시에 시작한 다른 요청이 이미 올린 판
    const objects = new Set(['d1/1/index.md', 'd1/2/index.md', 'd1/2/img/a.png']);
    const deps: IssueUploadUrlsDeps = {
      deleteFiles: async (prefix) => {
        for (const name of [...objects]) if (name.startsWith(prefix)) objects.delete(name);
      },
      signWriteUrl: async (name) => `https://bucket.example/${name}`,
    };
    await issueUploadUrlsWith(deps, { docId: 'd1', rev: 1, files: FILES, expires: EXPIRES });
    expect([...objects].sort()).toEqual(['d1/2/img/a.png', 'd1/2/index.md']);
  });

  it('있던 문서도 자기 판 경로를 지운다 (내린 문서가 남긴 판 번호가 1이 아닐 수 있다)', async () => {
    const { log, deps } = fakeDeps();
    await issueUploadUrlsWith(deps, { docId: 'd1', rev: 4, files: FILES, expires: EXPIRES });
    expect(log.filter((line) => line.startsWith('clean'))).toEqual(['clean d1/4/']);
  });

  it('청소가 실패해도 서명 주소를 준다 (남은 파일이 있으면 그 PUT만 412가 된다)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = fakeDeps({ failClean: true });
    const uploads = await issueUploadUrlsWith(deps, { docId: 'd1', rev: 1, files: FILES, expires: EXPIRES });
    expect(uploads.map((upload) => upload.path)).toEqual(['index.md', 'img/a.png']);
  });

  it('서명과 입구가 보낼 머리에 "없을 때만 만들기" 조건을 넣는다', async () => {
    const { signed, deps } = fakeDeps();
    const uploads = await issueUploadUrlsWith(deps, { docId: 'd1', rev: 2, files: FILES, expires: EXPIRES });
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
