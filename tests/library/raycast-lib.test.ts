// Raycast 확장의 UI 밖 부분 (서가 1단계 T9, Plan J19)
// - tools/raycast-cruz-lab/src/lib/는 @raycast/api를 가져오지 않는다. 그래서 루트 vitest로 시험한다.
// - readSettings: 확장 설정(서버 주소, 서가 토큰) 읽기
// - uploadPaths: 고른 경로들을 공용 모듈(planPush·pushJob)로 올리고 결과를 한 보고로 모은다
// - docMeta: "서가 문서" 목록 한 줄의 보조 글

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { docMeta } from '../../tools/raycast-cruz-lab/src/lib/doc-meta';
import { finderSelectionIfFrontmost } from '../../tools/raycast-cruz-lab/src/lib/finder';
import { DEFAULT_SERVER, readSettings } from '../../tools/raycast-cruz-lab/src/lib/settings';
import { uploadPaths } from '../../tools/raycast-cruz-lab/src/lib/upload';

describe('readSettings', () => {
  it('서버 주소가 비면 운영 서가를 쓴다. 토큰 앞뒤 공백을 지운다', () => {
    expect(readSettings({ server: '  ', token: '  secret \n' })).toEqual({ ok: true, server: DEFAULT_SERVER, token: 'secret' });
    expect(DEFAULT_SERVER).toBe('https://www.cruzlab.dev');
  });

  it('서버 주소 끝의 / 를 지운다', () => {
    expect(readSettings({ server: 'http://localhost:4341/', token: 't' })).toEqual({
      ok: true,
      server: 'http://localhost:4341',
      token: 't',
    });
  });

  it('토큰이 없거나 서버 주소가 틀리면 할 일을 알린다', () => {
    const noToken = readSettings({ server: '', token: ' ' });
    expect(noToken.ok).toBe(false);
    if (!noToken.ok) expect(noToken.message).toContain('lab token --copy');

    const badServer = readSettings({ server: 'localhost:4341', token: 't' });
    expect(badServer).toEqual({ ok: false, message: '서버 주소가 틀렸습니다: localhost:4341' });
  });
});

describe('docMeta', () => {
  const base = { docDate: null, formats: {}, uploadedAt: '2026-11-17T16:30:00.000Z' };

  it('문서 날짜가 있으면 그 날짜, 없으면 올린 날(한국 시각)을 쓴다', () => {
    expect(docMeta({ ...base, docDate: '2026-11-16' }).date).toBe('2026-11-16');
    // 2026-11-17 16:30 UTC = 2026-11-18 01:30 KST
    expect(docMeta(base).date).toBe('2026-11-18 올림');
  });

  it('형식을 md·html 순서로 잇는다', () => {
    const formats = {
      html: { rev: 1, entry: 'index.html', bytes: 10, fileCount: 3 },
      md: { rev: 2, entry: 'index.md', bytes: 5, fileCount: 1 },
    };
    expect(docMeta({ ...base, formats }).formats).toBe('md·html');
  });
});

// ---------- finderSelectionIfFrontmost ----------
// 사용자 확인(2026-11-18): Finder에 선택이 남은 채 크롬을 쓰다가 "서가에 올리기"를 열면 그 선택이 바로 올라갔다.
// getSelectedFinderItems는 Finder가 뒤에 있어도 Finder 창의 선택을 돌려준다. 그래서 맨 앞 앱을 먼저 본다.

describe('finderSelectionIfFrontmost', () => {
  const selection = async () => ['/Users/me/projects/blog/notes.md'];

  it('Raycast를 열기 전 맨 앞 앱이 Finder면 Finder 선택을 쓴다', async () => {
    const paths = await finderSelectionIfFrontmost({ frontmostBundleId: async () => 'com.apple.finder', selectedPaths: selection });

    expect(paths).toEqual(['/Users/me/projects/blog/notes.md']);
  });

  it('맨 앞 앱이 Finder가 아니면 Finder에 남은 선택을 읽지 않는다', async () => {
    let read = false;
    const paths = await finderSelectionIfFrontmost({
      frontmostBundleId: async () => 'com.google.Chrome',
      selectedPaths: async () => {
        read = true;
        return ['/Users/me/projects/blog/notes.md'];
      },
    });

    expect(paths).toEqual([]);
    expect(read).toBe(false);
  });

  it('맨 앞 앱이나 선택을 읽지 못하면 빈 목록이다 (파일 고르기 칸을 연다)', async () => {
    const fail = async (): Promise<never> => {
      throw new Error('읽지 못함');
    };

    expect(await finderSelectionIfFrontmost({ frontmostBundleId: fail, selectedPaths: selection })).toEqual([]);
    expect(
      await finderSelectionIfFrontmost({ frontmostBundleId: async () => 'com.apple.finder', selectedPaths: fail }),
    ).toEqual([]);
  });
});

// ---------- uploadPaths ----------

let home: string;

function put(relativePath: string, content = 'x'): string {
  const path = join(home, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'raycast-upload-test-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

// 서버 계약을 흉내 내는 가짜 fetch. 원본 경로(확장자 뺀 것)가 같으면 같은 문서 id를 준다(J8 짝 묶기)
function fakeServer(options: { startStatus?: number; phonePending?: boolean } = {}) {
  const ids = new Map<string, string>();
  const titles = new Map<string, string>();
  let rev = 0;
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (url.endsWith('/api/library/token/uploads')) {
      if (options.startStatus) {
        return Response.json({ error: { code: 'UNAUTHENTICATED', message: '서가 토큰이 틀렸습니다.' } }, { status: options.startStatus });
      }
      const body = JSON.parse(String(init.body)) as {
        sourcePath: string;
        fileName: string;
        files: { path: string }[];
        force?: boolean;
      };
      // 서가 2단계 J42: 폰 판이 있는 문서처럼 막는다(force면 통과)
      if (options.phonePending && !body.force) {
        return Response.json({ error: { code: 'PHONE_EDIT_PENDING', message: '폰 판이 있습니다.' } }, { status: 409 });
      }
      const key = body.sourcePath.replace(/\.(md|html)$/, '');
      if (!ids.has(key)) ids.set(key, `doc${String(ids.size).padStart(17, '0')}`);
      const docId = ids.get(key)!;
      titles.set(docId, body.fileName);
      rev += 1;
      return Response.json({
        docId,
        rev,
        uploads: body.files.map((file) => ({ path: file.path, url: `https://storage.example/${docId}/${file.path}`, headers: {} })),
      });
    }
    if (url.startsWith('https://storage.example/')) return new Response(null, { status: 200 });
    if (url.endsWith('/api/library/token/uploads/finalize')) {
      const { docId } = JSON.parse(String(init.body)) as { docId: string };
      return Response.json({ doc: { id: docId, title: titles.get(docId), url: `http://localhost:4341/admin/library/d/${docId}` } });
    }
    return new Response('없음', { status: 404 });
  };
  return fetchFn as typeof fetch;
}

describe('uploadPaths', () => {
  it('고른 파일을 올리고, 빠진 자산 알림을 이름과 함께 모은다', async () => {
    const md = put('projects/blog/notes.md', '# 노트\n![a](img/a.png)\n![b](img/gone.png)');
    put('projects/blog/img/a.png', 'PNG');
    const statuses: string[] = [];

    const report = await uploadPaths([md], {
      home,
      server: 'http://localhost:4341',
      token: 't',
      fetch: fakeServer(),
      onStatus: (text) => statuses.push(text),
    });

    expect(report.failures).toEqual([]);
    expect(report.docs).toEqual([
      { id: 'doc00000000000000000', title: 'notes.md', url: 'http://localhost:4341/admin/library/d/doc00000000000000000' },
    ]);
    expect(report.notes).toEqual(['notes.md — 원본에 없음: img/gone.png']);
    expect(statuses[0]).toBe('notes.md (1/1)');
  });

  it('받을 수 없는 경로는 실패로 남기고 나머지를 올린다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const pdf = put('projects/blog/paper.pdf', '%PDF');

    const report = await uploadPaths([pdf, join(home, 'nope.md'), md], {
      home,
      server: 'http://localhost:4341',
      token: 't',
      fetch: fakeServer(),
    });

    expect(report.docs.map((doc) => doc.title)).toEqual(['notes.md']);
    expect(report.failures).toEqual(['paper.pdf: md·html 파일이나 폴더가 아닙니다', 'nope.md: 경로가 없습니다']);
  });

  it('같은 이름의 md·html을 둘 다 고르면 한 문서로 센다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const html = put('projects/blog/notes.html', '<title>노트</title>');

    const report = await uploadPaths([md, html], { home, server: 'http://localhost:4341', token: 't', fetch: fakeServer() });

    expect(report.docs).toHaveLength(1);
    expect(report.failures).toEqual([]);
  });

  it('토큰이 틀리면 Raycast 설정에서 할 일을 알린다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');

    const report = await uploadPaths([md], {
      home,
      server: 'http://localhost:4341',
      token: 'bad',
      fetch: fakeServer({ startStatus: 401 }),
    });

    expect(report.docs).toEqual([]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatch(/^notes\.md: 서가 토큰이 틀렸습니다\. Raycast 설정/);
    expect(report.failures[0]).toContain('lab token --copy');
  });
});

// 서가 2단계 T7 (Plan J42): 폰에서 고친 판이 있으면 확인 창으로 묻는다
describe('uploadPaths: 폰 판이 있을 때', () => {
  it('묻고 덮어쓰기를 고르면 force로 다시 올린다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const asked: string[] = [];

    const report = await uploadPaths([md], {
      home,
      server: 'http://localhost:4341',
      token: 't',
      fetch: fakeServer({ phonePending: true }),
      confirmOverwrite: async (fileName) => {
        asked.push(fileName);
        return true;
      },
    });

    expect(asked).toEqual(['notes.md']);
    expect(report.failures).toEqual([]);
    expect(report.docs).toHaveLength(1);
  });

  it('그만두기를 고르면 올리지 않고 실패로 남긴다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');

    const report = await uploadPaths([md], {
      home,
      server: 'http://localhost:4341',
      token: 't',
      fetch: fakeServer({ phonePending: true }),
      confirmOverwrite: async () => false,
    });

    expect(report.docs).toEqual([]);
    expect(report.failures[0]).toContain('폰에서 고친 판');
  });
});
