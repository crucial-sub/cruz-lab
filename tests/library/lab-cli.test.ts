// 명령 lab push (서가 1단계 T8, Plan J16·J20)
// - scripts/lab.mjs를 새 Node 프로세스로 돌린다. 서가 서버는 node:http 가짜 서버로 계약을 흉내 낸다.
// - 키체인 대신 LAB_TOKEN 환경 변수로 토큰을 준다(시험용 길). HOME은 임시 폴더로 바꾼다.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LAB = join(ROOT, 'scripts/lab.mjs');
const DOC_ID = 'abc123def456abc123de';

let server: Server;
let origin: string;
const seen: { method: string; url: string; auth?: string; ifMatch?: string; body?: string }[] = [];

// 서가 2단계 T7: lab pull용 폰 판 하나 (원본 ~/projects/blog/pull.md)
const PULL_DOC_ID = 'pull123doc456';
const PULL_BASE = '# 되돌리기\n\n맥 글\n';
const PULL_PHONE = '# 되돌리기\n\n폰 글\n';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// 마지막 올리기 시작의 원본 경로 (마무리 응답이 sharedBy를 고른다)
let lastSourcePath = '';

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const body = await readBody(request);
    const url = request.url ?? '';
    seen.push({
      method: request.method ?? '',
      url,
      auth: request.headers.authorization,
      ifMatch: request.headers['x-goog-if-generation-match'] as string | undefined,
      body,
    });
    const json = (status: number, data: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    if (url.startsWith('/api/') && request.headers.authorization !== 'Bearer test-token') {
      return json(401, { error: { code: 'UNAUTHENTICATED', message: '서가 토큰이 필요합니다.' } });
    }
    if (request.method === 'POST' && url === '/api/library/token/uploads') {
      const sent = JSON.parse(body) as { files: { path: string }[]; sourcePath: string; force?: boolean };
      // 서가 2단계 J42: 원본 경로에 phone-pending이 들면 폰 판이 있는 문서처럼 409 (force면 통과)
      lastSourcePath = sent.sourcePath;
      if (sent.sourcePath.includes('phone-pending') && !sent.force) {
        return json(409, { error: { code: 'PHONE_EDIT_PENDING', message: '폰에서 고친 판이 있습니다.' } });
      }
      return json(200, {
        docId: DOC_ID,
        rev: 1,
        expiresAt: new Date().toISOString(),
        uploads: sent.files.map((file) => ({
          path: file.path,
          url: `${origin}/put/${encodeURIComponent(file.path)}`,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'x-goog-if-generation-match': '0' },
        })),
      });
    }
    if (request.method === 'PUT' && url.startsWith('/put/')) {
      // 서명 PUT: 서명에 든 머리가 빠지면 버킷처럼 400
      response.writeHead(request.headers['x-goog-if-generation-match'] === '0' ? 200 : 400);
      return response.end();
    }
    if (request.method === 'POST' && url === '/api/library/token/uploads/finalize') {
      // 서가 2단계 J52: 원본 경로에 shared-folder가 들면 공유 중인 묶음 안 문서처럼 sharedBy를 준다
      const sharedBy = lastSourcePath.includes('shared-folder')
        ? [{ id: 'AbCdEfGhIjKlMnOpQrStUv_-', kind: 'folder', label: 'shared-folder · docs' }]
        : undefined;
      return json(200, { doc: { id: DOC_ID, title: '노트', url: `${origin}/admin/library/d/${DOC_ID}` }, sharedBy });
    }
    // 서가 2단계 T7: 되돌리기 토큰 API (J41)
    if (request.method === 'GET' && url === '/api/library/token/docs?pending=md') {
      return json(200, { docs: [{ id: PULL_DOC_ID, title: '되돌리기', project: 'blog', mdPendingRev: 5 }] });
    }
    if (request.method === 'GET' && url === `/api/library/token/docs/${PULL_DOC_ID}/md`) {
      return json(200, {
        id: PULL_DOC_ID,
        title: '되돌리기',
        rev: 5,
        origin: 'phone',
        text: PULL_PHONE,
        sha256: sha(PULL_PHONE),
        macSha256: sha(PULL_BASE),
        pendingRev: 5,
        sourcePath: '~/projects/blog/pull.md',
      });
    }
    if (request.method === 'POST' && url === `/api/library/token/docs/${PULL_DOC_ID}/md/pulled`) {
      response.writeHead(204);
      return response.end();
    }
    return json(404, { error: { code: 'NOT_FOUND', message: '없는 주소입니다.' } });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lab-cli-test-'));
  seen.length = 0;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

// lab을 돌린다. 실패해도 던지지 않고 종료 코드와 출력을 돌려준다
function lab(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [LAB, ...args],
      { cwd: ROOT, env: { PATH: process.env.PATH ?? '', HOME: home, LAB_TOKEN: 'test-token', ...env } },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

function putDoc(): string {
  const dir = join(home, 'projects/blog');
  mkdirSync(join(dir, 'img'), { recursive: true });
  writeFileSync(join(dir, 'notes.md'), '# 노트\n![a](img/a.png)\n![없음](img/gone.png)');
  writeFileSync(join(dir, 'img/a.png'), 'png');
  return join(dir, 'notes.md');
}

describe('lab push', () => {
  it('올리고, 서가 문서 주소와 터미널 QR을 보인다', async () => {
    const result = await lab(['push', '--server', origin, putDoc()]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('올림: 노트');
    expect(result.stdout).toContain(`${origin}/admin/library/d/${DOC_ID}`);
    expect(result.stdout).toContain('원본에 없음: img/gone.png');
    expect(result.stdout).toMatch(/[▀▄█]/);
    const puts = seen.filter((request) => request.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts.every((request) => request.ifMatch === '0')).toBe(true);
  });

  it('터미널이 아닌 출력(도구 결과·로그)에는 색 제어 문자 없이 글자만으로 QR을 그린다', async () => {
    const result = await lab(['push', '--server', origin, putDoc()]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('\u001b[');
    expect(result.stdout).toContain('█▀▀▀▀▀█');
  });

  it('--qr-png 폴더를 주면 문서마다 QR 그림(PNG)을 만들고 경로를 보인다', async () => {
    const out = join(home, 'qr');
    mkdirSync(out);

    const result = await lab(['push', '--server', origin, '--qr-png', out, putDoc()]);

    expect(result.code).toBe(0);
    const png = join(out, `lab-qr-${DOC_ID}.png`);
    expect(result.stdout).toContain(`QR 그림: ${png}`);
    expect(readFileSync(png).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('--no-qr이면 QR을 그리지 않는다', async () => {
    const result = await lab(['push', '--no-qr', `--server=${origin}`, putDoc()]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toMatch(/[▀▄█]/);
  });

  it('토큰이 틀리면 1로 끝나고 무엇이 틀렸는지 알린다', async () => {
    const result = await lab(['push', '--server', origin, putDoc()], { LAB_TOKEN: 'wrong' });

    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain('LIBRARY_TOKEN_SHA256');
  });

  it('없는 경로는 실패로 알리고 다른 경로는 계속 올린다', async () => {
    const result = await lab(['push', '--no-qr', '--server', origin, join(home, 'nope.md'), putDoc()]);

    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain('경로가 없습니다');
    expect(result.stdout).toContain('올림: 노트');
  });

  it('경로가 없으면 쓰는 법을 보이고 2로 끝난다', async () => {
    const result = await lab(['push']);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('lab push');
  });
});

// 서가 2단계 T9 (Plan J52)
describe('lab push: 공유 중인 묶음', () => {
  it('공유 중인 묶음에 들어가면 경고 줄을 보인다', async () => {
    const dir = join(home, 'projects/shared-folder/docs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'notes.md'), '# 노트');
    const result = await lab(['push', '--no-qr', '--server', origin, join(dir, 'notes.md')]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("  주의: 공유 중인 묶음 'shared-folder · docs'에 들어갔습니다. 주소를 아는 사람이 읽습니다.");
  });

  it('공유가 없으면 경고 줄이 없다', async () => {
    const result = await lab(['push', '--no-qr', '--server', origin, putDoc()]);
    expect(result.stdout).not.toContain('공유 중');
  });
});

// 서가 2단계 T7 (Plan J40·J42)
describe('lab push: 폰 판이 있을 때', () => {
  function putPending(): string {
    const dir = join(home, 'projects/phone-pending');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'notes.md'), '# 노트');
    return join(dir, 'notes.md');
  }

  it('터미널이 아니면 묻지 않고 멈춘다. lab pull과 --force를 안내하고 1로 끝난다', async () => {
    const result = await lab(['push', '--no-qr', '--server', origin, putPending()]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('lab pull');
    expect(result.stderr).toContain('--force');
    expect(seen.some((request) => request.url === '/api/library/token/uploads/finalize')).toBe(false);
  });

  it('--force면 덮어쓰고 올린다', async () => {
    const result = await lab(['push', '--no-qr', '--force', '--server', origin, putPending()]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('올림: 노트');
    const start = seen.find((request) => request.url === '/api/library/token/uploads');
    expect(JSON.parse(start?.body ?? '{}')).toMatchObject({ force: true });
  });
});

describe('lab pull', () => {
  it('① 원본이 서가가 아는 내용이면 폰 판으로 바꾸고 백업 경로를 보인다. 0으로 끝난다', async () => {
    const dir = join(home, 'projects/blog');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pull.md'), PULL_BASE);

    const result = await lab(['pull', '--server', origin]);

    expect(result.code).toBe(0);
    expect(readFileSync(join(dir, 'pull.md'), 'utf8')).toBe(PULL_PHONE);
    expect(result.stdout).toContain('되돌림: 되돌리기');
    expect(result.stdout).toContain('~/Library/Application Support/cruz-lab/pull-backup/');
    expect(seen.some((request) => request.method === 'POST' && request.url.endsWith('/md/pulled'))).toBe(true);
  });

  it('③ 원본도 바뀌었으면 원본을 두고 .phone.md와 차이를 보인다. 2로 끝난다', async () => {
    const dir = join(home, 'projects/blog');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pull.md'), '# 되돌리기\n\n맥에서 또 고친 글\n');

    const result = await lab(['pull', '--server', origin]);

    expect(result.code).toBe(2);
    expect(readFileSync(join(dir, 'pull.md'), 'utf8')).toBe('# 되돌리기\n\n맥에서 또 고친 글\n');
    expect(readFileSync(join(dir, 'pull.phone.md'), 'utf8')).toBe(PULL_PHONE);
    expect(result.stdout).toContain('충돌: 되돌리기');
    expect(result.stdout).toContain('+ 폰 글');
  });

  it('토큰이 틀리면 1로 끝난다', async () => {
    const result = await lab(['pull', '--server', origin], { LAB_TOKEN: 'wrong' });
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain('LIBRARY_TOKEN_SHA256');
  });
});
