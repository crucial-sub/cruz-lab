// 맥 되돌리기 공용 모듈 (서가 2단계 T7, Plan J40·J41·J43)
// - pullTargets: 인자가 없으면 폰 판이 있는 문서 모두, 있으면 그 원본 경로의 문서. 문서마다 ①~④를 판정한다.
// - 파일 체계는 실제 임시 폴더(가짜 HOME)를 쓴다. 서버는 가짜 fetch로 토큰 API 계약을 흉내 낸다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupDirFor, pullExitCode, pullTargets, type PullOutcome } from '@/library/client/pull';
import { docKeyFromSourcePath } from '@/library/rules';
import { docIdForKey } from '@/library/ticket';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const BASE = '# 노트\n\n맥에서 쓴 글\n';
const PHONE = '# 노트\n\n폰에서 고친 글\n';
const OTHER = '# 노트\n\n맥에서 따로 고친 글\n';

let home: string;
let backupDir: string;

interface FakeDoc {
  id: string;
  title: string;
  rev: number;
  text: string;
  sha256?: string;
  macSha256: string | null;
  pendingRev: number | null;
  sourcePath: string | null;
}

// 가짜 서버: 문서들, 받은 요청 기록. pulledStatus로 되돌림 알림의 응답 상태를 바꾼다
function fakeServer(docs: FakeDoc[], options: { pulledStatus?: number } = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const json = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: `${url.pathname}${url.search}`, body });
    if ((init?.headers as Record<string, string>)?.Authorization !== 'Bearer test-token') {
      return json(401, { error: { code: 'UNAUTHENTICATED', message: '서가 토큰이 필요합니다.' } });
    }
    if (method === 'GET' && url.pathname === '/api/library/token/docs' && url.searchParams.get('pending') === 'md') {
      return json(200, {
        docs: docs
          .filter((doc) => doc.pendingRev !== null && doc.sourcePath !== null)
          .map((doc) => ({ id: doc.id, title: doc.title, project: 'p', mdPendingRev: doc.pendingRev })),
      });
    }
    const md = url.pathname.match(/^\/api\/library\/token\/docs\/([^/]+)\/md$/);
    if (method === 'GET' && md) {
      const doc = docs.find((item) => item.id === md[1]);
      if (!doc) return json(404, { error: { code: 'NOT_FOUND', message: '서가에 md 문서가 없습니다.' } });
      return json(200, { ...doc, origin: 'phone', sha256: doc.sha256 ?? sha(doc.text) });
    }
    const pulled = url.pathname.match(/^\/api\/library\/token\/docs\/([^/]+)\/md\/pulled$/);
    if (method === 'POST' && pulled) {
      if (options.pulledStatus === 409) return json(409, { error: { code: 'REV_CHANGED', message: '그사이 바뀌었습니다.' } });
      return new Response(null, { status: 204 });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: '없는 주소입니다.' } });
  }) as typeof fetch;
  return { calls, fetchFn };
}

// home 아래 파일
function put(relativePath: string, content: string): string {
  const path = join(home, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

const read = (relativePath: string) => readFileSync(join(home, relativePath), 'utf8');

function phoneDoc(extra: Partial<FakeDoc> = {}): FakeDoc {
  return {
    id: 'doc-a-123456',
    title: '노트',
    rev: 3,
    text: PHONE,
    macSha256: sha(BASE),
    pendingRev: 3,
    sourcePath: '~/projects/p/a.md',
    ...extra,
  };
}

async function run(docs: FakeDoc[], paths: string[] = [], options: { pulledStatus?: number } = {}) {
  const server = fakeServer(docs, options);
  const outcomes = await pullTargets(paths, {
    server: 'https://lab.test',
    token: 'test-token',
    fetch: server.fetchFn,
    home,
    backupDir,
  });
  return { outcomes, calls: server.calls };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lab-pull-test-'));
  backupDir = join(home, 'Library/Application Support/cruz-lab/pull-backup/2026-11-20-090000');
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('pullTargets ① 원본이 서가가 아는 내용', () => {
  it('원본을 백업한 뒤 폰 판으로 바꾸고, 서버에 되돌림을 알린다', async () => {
    put('projects/p/a.md', BASE);

    const { outcomes, calls } = await run([phoneDoc()]);

    expect(outcomes).toEqual([
      expect.objectContaining({ kind: 'replaced', docId: 'doc-a-123456', path: join(home, 'projects/p/a.md'), rev: 3 }),
    ]);
    expect(read('projects/p/a.md')).toBe(PHONE);
    expect(readFileSync(join(backupDir, 'projects/p/a.md'), 'utf8')).toBe(BASE);
    expect((outcomes[0] as Extract<PullOutcome, { kind: 'replaced' }>).backupPath).toBe(join(backupDir, 'projects/p/a.md'));
    expect(calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/library/token/docs/doc-a-123456/md/pulled',
      body: { rev: 3, sha256: sha(PHONE) },
    });
    // 같은 폴더에 임시 파일이 남지 않는다
    expect(readdirSync(join(home, 'projects/p'))).toEqual(['a.md']);
    expect(pullExitCode(outcomes)).toBe(0);
  });

  it('원본을 바꾼 뒤 알림이 409면(그사이 다시 고침) 바꾼 결과에 경고를 단다', async () => {
    put('projects/p/a.md', BASE);
    const { outcomes } = await run([phoneDoc()], [], { pulledStatus: 409 });
    expect(outcomes[0]).toMatchObject({ kind: 'replaced' });
    expect((outcomes[0] as Extract<PullOutcome, { kind: 'replaced' }>).warning).toContain('다시');
    expect(read('projects/p/a.md')).toBe(PHONE);
  });
});

describe('pullTargets ② 원본이 이미 폰 판', () => {
  it('원본을 그대로 두고 알림만 보낸다', async () => {
    put('projects/p/a.md', PHONE);
    const { outcomes, calls } = await run([phoneDoc()]);
    expect(outcomes).toEqual([expect.objectContaining({ kind: 'same', docId: 'doc-a-123456' })]);
    expect(read('projects/p/a.md')).toBe(PHONE);
    expect(existsSync(backupDir)).toBe(false);
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/md/pulled'))).toBe(true);
    expect(pullExitCode(outcomes)).toBe(0);
  });
});

describe('pullTargets ③ 원본도 바뀜, 해시 모름', () => {
  it('원본을 그대로 두고 옆에 .phone.md를 두고 차이를 보인다. 종료 코드 2', async () => {
    put('projects/p/a.md', OTHER);

    const { outcomes, calls } = await run([phoneDoc()]);

    const outcome = outcomes[0] as Extract<PullOutcome, { kind: 'conflict' }>;
    expect(outcome.kind).toBe('conflict');
    expect(outcome.reason).toBe('both-changed');
    expect(outcome.phonePath).toBe(join(home, 'projects/p/a.phone.md'));
    expect(outcome.diff).toEqual(['@@ 3번째 줄부터', '- 맥에서 따로 고친 글', '+ 폰에서 고친 글']);
    expect(read('projects/p/a.md')).toBe(OTHER);
    expect(read('projects/p/a.phone.md')).toBe(PHONE);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(pullExitCode(outcomes)).toBe(2);
  });

  it('서가가 원본 해시를 모르면(macSha256 없음) 덮어쓰지 않는다', async () => {
    put('projects/p/a.md', BASE);
    const { outcomes } = await run([phoneDoc({ macSha256: null })]);
    expect(outcomes[0]).toMatchObject({ kind: 'conflict', reason: 'unknown-base' });
    expect(read('projects/p/a.md')).toBe(BASE);
  });

  it('이미 있는 다른 .phone.md는 백업한 뒤 바꾼다', async () => {
    put('projects/p/a.md', OTHER);
    put('projects/p/a.phone.md', '사람이 합치던 글');
    await run([phoneDoc()]);
    expect(read('projects/p/a.phone.md')).toBe(PHONE);
    expect(readFileSync(join(backupDir, 'projects/p/a.phone.md'), 'utf8')).toBe('사람이 합치던 글');
  });
});

describe('pullTargets ④ 건너뛰기', () => {
  it('원본 파일이 없으면 건너뛰고 알린다', async () => {
    const { outcomes } = await run([phoneDoc()]);
    expect(outcomes).toEqual([expect.objectContaining({ kind: 'skipped', reason: 'missing' })]);
    expect(pullExitCode(outcomes)).toBe(0);
  });

  it('폴더째 문서(원본 경로가 폴더)면 건너뛴다', async () => {
    put('projects/p/bundle/index.md', BASE);
    const { outcomes } = await run([phoneDoc({ sourcePath: '~/projects/p/bundle.md' })]);
    expect(outcomes).toEqual([expect.objectContaining({ kind: 'skipped', reason: 'folder' })]);
  });

  // 폴더 2차 Plan J65: 짝 문서의 원본 경로가 .html로 남아도 같은 이름의 .md가 원본이다
  it('원본 경로가 .html이면 같은 이름의 .md를 원본으로 되돌린다', async () => {
    const md = put('projects/p/set/a.md', BASE);
    put('projects/p/set/a.html', '<p>그림</p>');
    const { outcomes } = await run([phoneDoc({ sourcePath: '~/projects/p/set/a.html' })]);
    expect(outcomes[0]).toMatchObject({ kind: 'replaced', path: md });
    expect(readFileSync(md, 'utf8')).toBe(PHONE);
    expect(readFileSync(join(home, 'projects/p/set/a.html'), 'utf8')).toBe('<p>그림</p>');
    expect(existsSync(join(home, 'projects/p/set/a.html.phone.md'))).toBe(false);
  });

  it('원본 경로가 .HTML(대문자)이어도 .md를 원본으로 쓴다', async () => {
    const md = put('projects/p/set/b.md', BASE);
    const { outcomes } = await run([phoneDoc({ sourcePath: '~/projects/p/set/b.HTML' })]);
    expect(outcomes[0]).toMatchObject({ kind: 'replaced', path: md });
  });

  it('원본 경로가 .html이고 .md 파일이 없으면 건너뛴다. html을 바꾸지 않는다', async () => {
    const html = put('projects/p/set/c.html', '<p>그림</p>');
    const { outcomes } = await run([phoneDoc({ sourcePath: '~/projects/p/set/c.html' })]);
    expect(outcomes[0]).toMatchObject({ kind: 'skipped', reason: 'missing' });
    expect(readFileSync(html, 'utf8')).toBe('<p>그림</p>');
  });

  it('폴더째 문서의 원본 경로가 .html이어도 지금처럼 건너뛴다', async () => {
    put('projects/p/site/index.html', '<p>사이트</p>');
    put('projects/p/site/index.md', BASE);
    const { outcomes } = await run([phoneDoc({ sourcePath: '~/projects/p/site.html' })]);
    expect(outcomes[0]).toMatchObject({ kind: 'skipped', reason: 'folder' });
  });

  it('인자로 고른 문서가 서가 화면 문서(원본 경로 없음)면 건너뛴다', async () => {
    put('projects/p/a.md', BASE);
    const id = docIdForKey(docKeyFromSourcePath(join(home, 'projects/p/a.md'), home));
    const { outcomes } = await run([phoneDoc({ id, sourcePath: null })], [join(home, 'projects/p/a.md')]);
    expect(outcomes).toEqual([expect.objectContaining({ kind: 'skipped', reason: 'no-source' })]);
  });

  it('폰 판이 없는 문서는 건너뛴다', async () => {
    const path = put('projects/p/a.md', BASE);
    const id = docIdForKey(docKeyFromSourcePath(path, home));
    const { outcomes } = await run([phoneDoc({ id, pendingRev: null })], [path]);
    expect(outcomes).toEqual([expect.objectContaining({ kind: 'skipped', reason: 'not-pending' })]);
    expect(read('projects/p/a.md')).toBe(BASE);
  });
});

describe('pullTargets: 경로 인자와 실패', () => {
  it('경로를 주면 그 원본의 문서 id(J8)만 가져온다', async () => {
    const path = put('projects/p/a.md', BASE);
    const id = docIdForKey(docKeyFromSourcePath(path, home));
    const { outcomes, calls } = await run([phoneDoc({ id }), phoneDoc({ id: 'other-doc-999', sourcePath: '~/projects/p/b.md' })], [
      path,
    ]);
    expect(outcomes).toEqual([expect.objectContaining({ kind: 'replaced', docId: id })]);
    expect(calls.some((call) => call.path.includes('?pending=md'))).toBe(false);
    expect(calls.some((call) => call.path.includes('other-doc-999'))).toBe(false);
  });

  it('서가에 없는 문서 경로는 실패로 알린다. 종료 코드 1', async () => {
    const path = put('projects/p/none.md', BASE);
    const { outcomes } = await run([], [path]);
    expect(outcomes[0]).toMatchObject({ kind: 'failed' });
    expect(pullExitCode(outcomes)).toBe(1);
  });

  it('서버가 준 글의 해시가 틀리면 원본을 바꾸지 않고 실패로 알린다', async () => {
    put('projects/p/a.md', BASE);
    const { outcomes } = await run([phoneDoc({ sha256: 'd'.repeat(64) })]);
    expect(outcomes[0]).toMatchObject({ kind: 'failed' });
    expect(read('projects/p/a.md')).toBe(BASE);
  });

  it('실패와 충돌이 섞이면 종료 코드는 1이다', () => {
    const outcomes = [
      { kind: 'conflict' },
      { kind: 'failed' },
    ] as PullOutcome[];
    expect(pullExitCode(outcomes)).toBe(1);
  });
});

describe('backupDirFor', () => {
  it('~/Library/Application Support/cruz-lab/pull-backup/{현지 시각}', () => {
    const at = new Date(2026, 10, 20, 9, 5, 7);
    expect(backupDirFor('/Users/me', at)).toBe('/Users/me/Library/Application Support/cruz-lab/pull-backup/2026-11-20-090507');
  });
});
