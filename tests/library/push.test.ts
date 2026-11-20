// 맥 입구 공용 올리기 모듈 (서가 1단계 T8, Plan J8·J15·J16, 5.2 [올리기])
// - planPush: 고른 경로(파일·폴더)를 올리기 작업으로 나눈다. 빠진 자산을 원본 폴더에서 찾아 함께 넣는다.
// - pushJob: 올리기 시작 → 서명 PUT(서버가 준 머리 그대로) → 마무리.
// - 파일 체계는 실제 임시 폴더를 쓴다. 네트워크는 가짜 fetch로 서버 계약을 흉내 낸다.

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planPush, PushError, pushJob, type PushJob } from '@/library/client/push';

let home: string;

// home 아래에 파일을 만든다 (폴더는 저절로 만든다)
function put(relativePath: string, content: string | Buffer = 'x'): string {
  const path = join(home, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lab-push-test-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

// 작업의 문서 안 경로 목록 (정렬)
const pathsOf = (job: PushJob) => job.files.map((file) => file.path).sort();

describe('planPush: md 파일 하나', () => {
  it('진입 파일을 index.md로 바꾸고, md가 쓰는 그림만 원본 폴더에서 찾아 넣는다', async () => {
    const md = put(
      'projects/blog/docs/2026-11-18-notes.md',
      ['# 노트', '![그림](img/a.png)', '[다른 글](other.md)', '```', '![코드 안](img/code.png)', '```'].join('\n'),
    );
    put('projects/blog/docs/img/a.png', 'png');
    put('projects/blog/docs/img/code.png', 'png');
    put('projects/blog/docs/other.md', '# 다른 글');

    const [plan] = await planPush([md], { home });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.jobs).toHaveLength(1);
    const [job] = plan.jobs;
    expect(job.format).toBe('md');
    expect(job.sourcePath).toBe('~/projects/blog/docs/2026-11-18-notes.md');
    expect(job.fileName).toBe('2026-11-18-notes.md');
    expect(pathsOf(job)).toEqual(['img/a.png', 'index.md']);
    expect(job.files.find((file) => file.path === 'index.md')?.absPath).toBe(md);
    expect(plan.notes).toEqual([]);
  });

  it('같은 이름의 html이 옆에 있어도 고른 md만 올린다 (사용자 결정 2026-11-18, 짝 A)', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    put('projects/blog/notes.html', '<title>노트</title>');

    const [plan] = await planPush([md], { home });

    expect(plan.ok && plan.jobs.map((job) => job.format)).toEqual(['md']);
  });

  it('원본에 없는 그림, 문서 밖 주소, 받지 않는 형식은 알림으로 남기고 계속한다', async () => {
    const md = put(
      'projects/blog/notes.md',
      ['![없음](img/gone.png)', '![밖](../up.png)', '<img src="doc.pdf">', '![원격](https://example.com/x.png)'].join('\n'),
    );
    put('projects/blog/doc.pdf', 'pdf');
    put('projects/up.png', 'png');

    const [plan] = await planPush([md], { home });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(pathsOf(plan.jobs[0])).toEqual(['index.md']);
    expect(plan.notes).toEqual(
      expect.arrayContaining([
        { kind: 'missing', ref: 'img/gone.png' },
        { kind: 'outside', ref: '../up.png' },
        { kind: 'type', ref: 'doc.pdf' },
      ]),
    );
    expect(plan.notes).toHaveLength(3);
  });

  it('~/ 로 시작하는 경로를 홈 폴더로 푼다', async () => {
    put('Desktop/docs/a.md', '# A');

    const [plan] = await planPush(['~/Desktop/docs/a.md'], { home });

    expect(plan.ok && plan.jobs[0].sourcePath).toBe('~/Desktop/docs/a.md');
  });
});

describe('planPush: html 파일 하나와 옆 자산 (꼴 a)', () => {
  it('html·css가 가리키는 자산을 따라가 모두 넣는다. <a href> 링크와 다른 서버 주소는 넣지 않는다', async () => {
    const html = put(
      'projects/blog/report.html',
      [
        '<title>보고서</title>',
        '<link rel="stylesheet" href="report-assets/style.css">',
        '<img src="report-assets/shot%201.png" srcset="report-assets/shot@2x.png 2x">',
        '<script src="report-assets/app.js"></script>',
        '<script src="https://cdn.example.com/lib.js"></script>',
        '<a href="other.html">다른 문서</a>',
      ].join('\n'),
    );
    put('projects/blog/report-assets/style.css', '@import "base.css"; body { background: url(bg.webp) }');
    put('projects/blog/report-assets/base.css', '@font-face { src: url("fonts/a.woff2") }');
    put('projects/blog/report-assets/bg.webp', 'webp');
    put('projects/blog/report-assets/fonts/a.woff2', 'woff2');
    put('projects/blog/report-assets/shot 1.png', 'png');
    put('projects/blog/report-assets/shot@2x.png', 'png');
    put('projects/blog/report-assets/app.js', 'js');
    put('projects/blog/other.html', '<title>다른</title>');

    const [plan] = await planPush([html], { home });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const [job] = plan.jobs;
    expect(job.format).toBe('html');
    expect(job.sourcePath).toBe('~/projects/blog/report.html');
    expect(pathsOf(job)).toEqual([
      'index.html',
      'report-assets/app.js',
      'report-assets/base.css',
      'report-assets/bg.webp',
      'report-assets/fonts/a.woff2',
      'report-assets/shot 1.png',
      'report-assets/shot@2x.png',
      'report-assets/style.css',
    ]);
    expect(plan.notes).toEqual([]);
  });

  it('자산 이름이 진입 파일 이름(index.html)과 겹치면 그 자산을 빼고 알린다', async () => {
    const html = put('projects/blog/report.html', '<iframe src="index.html"></iframe>');
    put('projects/blog/index.html', '<title>다른 문서</title>');

    const [plan] = await planPush([html], { home });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(pathsOf(plan.jobs[0])).toEqual(['index.html']);
    expect(plan.jobs[0].files[0].absPath).toBe(html);
    expect(plan.notes).toEqual([{ kind: 'skipped', ref: 'index.html' }]);
  });
});

describe('planPush: 폴더째 문서 (꼴 b)', () => {
  it('폴더 안 파일을 모두 넣고, 원본 경로에 형식 확장자를 붙인다 (Plan 9절 4, PR #36 리뷰 I6)', async () => {
    const folder = join(home, 'projects/blog/study');
    put('projects/blog/study/index.html', '<title>공부장</title><script src="app.js"></script>');
    put('projects/blog/study/app.js', 'js');
    put('projects/blog/study/shots/1.png', 'png');
    put('projects/blog/study/.DS_Store', 'junk');
    put('projects/blog/study/.git/config', 'junk');

    const [plan] = await planPush([folder], { home });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const [job] = plan.jobs;
    expect(job.format).toBe('html');
    expect(job.sourcePath).toBe('~/projects/blog/study.html');
    expect(job.fileName).toBe('study.html');
    expect(pathsOf(job)).toEqual(['app.js', 'index.html', 'shots/1.png']);
    expect(job.files.find((file) => file.path === 'index.html')?.absPath).toBe(join(folder, 'index.html'));
  });

  it('.md로 끝나는 폴더도 형식 확장자를 붙여 다른 문서와 키가 겹치지 않는다', async () => {
    put('projects/blog/notes.md/index.html', '<title>폴더</title>');

    const [plan] = await planPush([join(home, 'projects/blog/notes.md')], { home });

    expect(plan.ok && plan.jobs[0].sourcePath).toBe('~/projects/blog/notes.md.html');
  });

  it('폴더 뿌리에 html과 같은 이름의 md가 있으면 작업 둘이 된다. md 작업에는 md가 쓰는 그림만 든다', async () => {
    put('projects/blog/plan/index.html', '<img src="img/a.png"><img src="img/b.png">');
    put('projects/blog/plan/index.md', '![a](img/a.png)');
    put('projects/blog/plan/img/a.png', 'a');
    put('projects/blog/plan/img/b.png', 'b');

    const [plan] = await planPush([join(home, 'projects/blog/plan')], { home });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const byFormat = Object.fromEntries(plan.jobs.map((job) => [job.format, job]));
    expect(byFormat.html.sourcePath).toBe('~/projects/blog/plan.html');
    expect(pathsOf(byFormat.html)).toEqual(['img/a.png', 'img/b.png', 'index.html']);
    expect(byFormat.md.sourcePath).toBe('~/projects/blog/plan.md');
    expect(pathsOf(byFormat.md)).toEqual(['img/a.png', 'index.md']);
  });

  it('macOS의 NFD 파일 이름을 NFC 문서 경로로 바꾸되, 읽는 경로는 원래 이름을 쓴다', async () => {
    const nfd = '그림.png'.normalize('NFD');
    put('projects/blog/kr/index.html', '<img src="그림.png">');
    const asset = put(`projects/blog/kr/${nfd}`, 'png');

    const [plan] = await planPush([join(home, 'projects/blog/kr')], { home });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const file = plan.jobs[0].files.find((item) => item.path === '그림.png'.normalize('NFC'));
    expect(file?.absPath).toBe(asset);
    expect(plan.notes).toEqual([]);
  });

  it('진입 파일을 정할 수 없는 폴더는 거부한다', async () => {
    put('projects/blog/mixed/a.html', 'a');
    put('projects/blog/mixed/b.html', 'b');

    const [plan] = await planPush([join(home, 'projects/blog/mixed')], { home });

    // 막힌 이유를 알리도록 폴더 뿌리의 html·md 개수를 함께 준다
    expect(plan).toEqual({
      ok: false,
      target: join(home, 'projects/blog/mixed'),
      error: 'NO_ENTRY_IN_FOLDER',
      rootDocs: { html: 2, md: 0 },
    });
  });
});

describe('planPush: 받을 수 없는 경로', () => {
  it('없는 경로, 문서가 아닌 파일, 홈 폴더 밖 파일을 거부한다', async () => {
    const pdf = put('projects/blog/a.pdf', 'pdf');
    const outsideRoot = mkdtempSync(join(tmpdir(), 'lab-push-outside-'));
    const outside = join(outsideRoot, 'a.md');
    writeFileSync(outside, '# 밖');

    try {
      const plans = await planPush([join(home, 'nope.md'), pdf, outside], { home });
      expect(plans.map((plan) => (plan.ok ? 'ok' : plan.error))).toEqual(['NOT_FOUND', 'NOT_DOC', 'OUTSIDE_HOME']);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

// ---------- pushJob ----------

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Buffer | null;
}

// 서버 계약을 흉내 내는 가짜 fetch (POST 시작 → PUT → POST 마무리)
function fakeServer(overrides: { start?: Response; put?: Response; finalize?: Response } = {}) {
  const requests: Recorded[] = [];
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const body = init.body === undefined || init.body === null ? null : Buffer.from(init.body as Uint8Array | string);
    requests.push({ method: init.method ?? 'GET', url, headers, body });
    if (url.endsWith('/api/library/token/uploads')) {
      if (overrides.start) return overrides.start;
      const sent = JSON.parse(body!.toString('utf8')) as { files: { path: string }[] };
      return Response.json({
        docId: 'abc123def456abc123de',
        rev: 3,
        expiresAt: '2026-11-18T12:00:00.000Z',
        uploads: sent.files.map((file) => ({
          path: file.path,
          url: `https://storage.example/put/${encodeURIComponent(file.path)}`,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'x-goog-if-generation-match': '0' },
        })),
      });
    }
    if (url.startsWith('https://storage.example/put/')) return overrides.put ?? new Response(null, { status: 200 });
    if (url.endsWith('/api/library/token/uploads/finalize')) {
      if (overrides.finalize) return overrides.finalize;
      return Response.json({ doc: { id: 'abc123def456abc123de', title: '노트', url: 'http://localhost:4341/admin/library/d/abc123def456abc123de' } });
    }
    return new Response('없음', { status: 404 });
  };
  return { requests, fetch: fetchFn as typeof fetch };
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('pushJob: 공유 중 경고 (서가 2단계 J52)', () => {
  it('마무리 응답의 sharedBy를 그대로 돌려준다', async () => {
    const md = put('projects/blog/shared.md', '# 공유');
    const [plan] = await planPush([md], { home });
    if (!plan.ok) throw new Error('계획 실패');
    const sharedBy = [{ id: 'AbCdEfGhIjKlMnOpQrStUv_-', kind: 'folder', label: 'blog · notes' }];
    const server = fakeServer({
      finalize: Response.json({ doc: { id: 'abc123def456abc123de', title: '공유', url: 'http://x/admin/library/d/abc123def456abc123de' }, sharedBy }),
    });
    const doc = await pushJob(plan.jobs[0], { server: 'http://localhost:4341', token: 't', fetch: server.fetch });
    expect(doc.sharedBy).toEqual(sharedBy);
  });
});

describe('pushJob', () => {
  it('목록·해시를 보내고, 서버가 준 머리를 그대로 붙여 PUT하고, 마무리한다', async () => {
    const md = put('projects/blog/notes.md', '# 노트\n![a](img/a.png)');
    put('projects/blog/img/a.png', 'PNG!');
    const [plan] = await planPush([md], { home });
    if (!plan.ok) throw new Error('계획 실패');
    const server = fakeServer();

    const doc = await pushJob(plan.jobs[0], { server: 'http://localhost:4341/', token: 'secret-token', fetch: server.fetch });

    // 옛 서버 응답(sharedBy 없음)이면 빈 목록이다 (서가 2단계 J52)
    expect(doc).toEqual({
      id: 'abc123def456abc123de',
      title: '노트',
      url: 'http://localhost:4341/admin/library/d/abc123def456abc123de',
      sharedBy: [],
    });
    const [start, ...rest] = server.requests;
    expect(start.method).toBe('POST');
    expect(start.url).toBe('http://localhost:4341/api/library/token/uploads');
    expect(start.headers.authorization).toBe('Bearer secret-token');
    expect(JSON.parse(start.body!.toString('utf8'))).toEqual({
      format: 'md',
      sourcePath: '~/projects/blog/notes.md',
      fileName: 'notes.md',
      files: expect.arrayContaining([
        { path: 'index.md', bytes: Buffer.byteLength('# 노트\n![a](img/a.png)'), sha256: sha256('# 노트\n![a](img/a.png)') },
        { path: 'img/a.png', bytes: 4, sha256: sha256('PNG!') },
      ]),
    });

    const puts = rest.filter((request) => request.method === 'PUT');
    expect(puts).toHaveLength(2);
    for (const request of puts) {
      expect(request.headers).toEqual({ 'content-type': 'text/markdown; charset=utf-8', 'x-goog-if-generation-match': '0' });
    }
    expect(puts.find((request) => request.url.endsWith('img%2Fa.png'))?.body?.toString('utf8')).toBe('PNG!');

    const finalize = rest[rest.length - 1];
    expect(finalize.url).toBe('http://localhost:4341/api/library/token/uploads/finalize');
    expect(finalize.headers.authorization).toBe('Bearer secret-token');
    expect(JSON.parse(finalize.body!.toString('utf8'))).toEqual({ docId: 'abc123def456abc123de', rev: 3 });
  });

  it('서버 오류 응답의 code와 message를 PushError로 올린다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const [plan] = await planPush([md], { home });
    if (!plan.ok) throw new Error('계획 실패');
    const server = fakeServer({
      start: Response.json({ error: { code: 'UNAUTHENTICATED', message: '서가 토큰이 필요합니다.' } }, { status: 401 }),
    });

    const error = await pushJob(plan.jobs[0], { server: 'http://localhost:4341', token: 'bad', fetch: server.fetch }).catch((e) => e);

    expect(error).toBeInstanceOf(PushError);
    expect(error).toMatchObject({ code: 'UNAUTHENTICATED', status: 401, message: '서가 토큰이 필요합니다.' });
  });

  // 서가 2단계 J42: 폰 판이 있을 때 묻고 덮어쓰기를 고르면 force: true로 다시 부른다
  it('force를 주면 올리기 시작에 force: true를 보낸다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const [plan] = await planPush([md], { home });
    if (!plan.ok) throw new Error('계획 실패');
    const server = fakeServer();

    await pushJob(plan.jobs[0], { server: 'http://localhost:4341', token: 't', fetch: server.fetch, force: true });

    expect(JSON.parse(server.requests[0].body!.toString('utf8'))).toMatchObject({ force: true });
  });

  it('폰 판이 있어 409 PHONE_EDIT_PENDING이면 그 코드로 PushError를 올린다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const [plan] = await planPush([md], { home });
    if (!plan.ok) throw new Error('계획 실패');
    const server = fakeServer({
      start: Response.json({ error: { code: 'PHONE_EDIT_PENDING', message: '폰 판이 있습니다.' } }, { status: 409 }),
    });

    const error = await pushJob(plan.jobs[0], { server: 'http://localhost:4341', token: 't', fetch: server.fetch }).catch((e) => e);

    expect(error).toMatchObject({ code: 'PHONE_EDIT_PENDING', status: 409 });
    expect(JSON.parse(server.requests[0].body!.toString('utf8'))).not.toHaveProperty('force');
  });

  it('PUT이 거절되면 마무리를 부르지 않고 PushError를 올린다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const [plan] = await planPush([md], { home });
    if (!plan.ok) throw new Error('계획 실패');
    const server = fakeServer({ put: new Response('precondition', { status: 412 }) });

    const error = await pushJob(plan.jobs[0], { server: 'http://localhost:4341', token: 't', fetch: server.fetch }).catch((e) => e);

    expect(error).toMatchObject({ code: 'PUT_FAILED', status: 412 });
    expect(server.requests.some((request) => request.url.endsWith('/finalize'))).toBe(false);
  });

  it('받을 수 없는 목록은 서버에 보내기 전에 거부한다', async () => {
    const md = put('projects/blog/notes.md', '# 노트');
    const [plan] = await planPush([md], { home });
    if (!plan.ok) throw new Error('계획 실패');
    const server = fakeServer();
    const job = { ...plan.jobs[0], files: [...plan.jobs[0].files, { ...plan.jobs[0].files[0], path: '../escape.md' }] };

    const error = await pushJob(job, { server: 'http://localhost:4341', token: 't', fetch: server.fetch }).catch((e) => e);

    expect(error).toMatchObject({ code: 'BAD_MANIFEST' });
    expect(server.requests).toHaveLength(0);
  });
});
