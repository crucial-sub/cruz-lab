// 맥 되돌리기 공용 모듈 (서가 2단계 T7, Plan J40·J41·J43, L6)
// - 명령 lab pull(scripts/lab.mjs)과 Raycast "서가에서 가져오기"가 같은 모듈을 쓴다.
// - 폰 판을 맥 원본 파일에 쓴다. 문서마다 판정한다(sync.ts decidePull):
//   ① 원본 해시 = 서가가 아는 해시: 원본을 백업 폴더에 복사한 뒤 폰 판으로 바꾼다(같은 폴더 임시 파일 → 이름 바꾸기).
//      서버에 "되돌림"을 알린다.
//   ② 원본 = 폰 판: 알림만 보낸다.
//   ③ 그 밖(원본도 바뀜, 해시 모름): 원본 옆에 {이름}.phone.md를 두고 차이 앞부분을 보인다. 원본은 그대로다.
//   ④ 원본 파일이 없음, 폴더째 문서, 서가 화면 문서, 폰 판 없음: 건너뛰고 알린다.
// - 원본을 잃는 길이 없다: 바꾸기 전 백업, 바꾸기 직전 원본을 다시 읽어 그사이 바뀌었으면 ③으로 돌린다.
// - push.ts와 같은 규칙: 상대 가져오기에 .ts, 지울 수 있는 TS 문법만, '@/…' 별칭 없음(tests/library/node-load.test.ts).

import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { docKeyFromSourcePath, toHomePath } from '../rules.ts';
import { decidePull, diffPreview, phoneCopyPath, type LocalSource } from '../sync.ts';
import { docIdForKey } from '../ticket.ts';
import type { LibraryDocItem } from './docs.ts';
import { callTokenApi, PushError, type TokenApiOptions } from './push.ts';

// 폰 판 읽기 응답 (서버 PhoneMdPayload와 같은 꼴. 서버 모듈은 Firebase를 가져오므로 따로 적는다)
export interface PhoneMd {
  id: string;
  title: string;
  rev: number;
  origin: 'mac' | 'web' | 'phone';
  text: string;
  sha256: string;
  macSha256: string | null;
  pendingRev: number | null;
  sourcePath: string | null;
}

export interface PullOptions extends TokenApiOptions {
  home: string; // 홈 폴더 절대 경로 (원본 경로 ~/… 를 푼다)
  backupDir: string; // 이번에 쓸 백업 폴더 (backupDirFor). ①·③에서 처음 쓸 때 만든다
  cwd?: string; // 상대 경로 인자를 풀 기준 (기본 process.cwd())
  // 서버 오류 → 글. 입구마다 할 일 안내가 다르다(messages.ts describeApiError). 없으면 오류의 message
  describeError?: (error: unknown) => string;
}

// 문서 하나의 결과
// - path: 맥 원본 절대 경로 (모르면 null)
// - warning: 원본은 바꿨지만 서버에 알리지 못한 경우 등
export type PullOutcome =
  | { kind: 'replaced'; docId: string; title: string; path: string; rev: number; backupPath: string; warning?: string }
  | { kind: 'same'; docId: string; title: string; path: string; rev: number; warning?: string }
  | {
      kind: 'conflict';
      docId: string;
      title: string;
      path: string;
      rev: number;
      reason: 'both-changed' | 'unknown-base';
      phonePath: string;
      diff: string[];
    }
  | {
      kind: 'skipped';
      docId: string;
      title: string;
      path: string | null;
      reason: 'missing' | 'folder' | 'no-source' | 'not-pending';
    }
  | { kind: 'failed'; docId: string | null; title: string; path: string | null; message: string };

const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pad = (value: number) => String(value).padStart(2, '0');

// 이번 되돌리기의 백업 폴더: ~/Library/Application Support/cruz-lab/pull-backup/{YYYY-MM-DD-HHMMSS} (현지 시각)
export function backupDirFor(home: string, at: Date): string {
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return join(home, 'Library/Application Support/cruz-lab/pull-backup', stamp);
}

// 종료 코드: 실패가 있으면 1, 아니고 충돌이 있으면 2, 그 밖 0
export function pullExitCode(outcomes: readonly PullOutcome[]): number {
  if (outcomes.some((outcome) => outcome.kind === 'failed')) return 1;
  if (outcomes.some((outcome) => outcome.kind === 'conflict')) return 2;
  return 0;
}

// ---------- 서버 ----------

// 폰 판이 있는 맥 문서 목록 (최근 것부터)
export async function listPendingPulls(options: TokenApiOptions): Promise<LibraryDocItem[]> {
  const data = await callTokenApi<{ docs?: unknown }>(options, 'GET', '/api/library/token/docs?pending=md');
  if (!Array.isArray(data.docs)) throw new PushError('BAD_RESPONSE', '폰 판 목록 응답을 읽지 못했습니다.');
  return data.docs as LibraryDocItem[];
}

export function fetchPhoneMd(options: TokenApiOptions, docId: string): Promise<PhoneMd> {
  return callTokenApi<PhoneMd>(options, 'GET', `/api/library/token/docs/${encodeURIComponent(docId)}/md`);
}

export async function reportPulled(options: TokenApiOptions, docId: string, rev: number, sha256: string): Promise<void> {
  await callTokenApi<null>(options, 'POST', `/api/library/token/docs/${encodeURIComponent(docId)}/md/pulled`, { rev, sha256 });
}

// ---------- 맥 원본 ----------

// 원본 경로(~/…) → 절대 경로
function absoluteSource(sourcePath: string, home: string): string {
  return join(home, sourcePath.slice(2));
}

// 원본의 지금 상태. 파일이면 내용도 돌려준다
// - 파일이 없고 같은 이름(확장자 뺀 것)의 폴더가 있으면 폴더째 문서다(올릴 때 원본 경로를 {폴더}.md로 보낸다)
async function readSource(path: string): Promise<{ local: LocalSource; bytes: Buffer | null }> {
  const info = await stat(path).catch(() => null);
  if (info?.isFile()) {
    const bytes = await readFile(path);
    return { local: { kind: 'file', sha256: sha256Hex(bytes) }, bytes };
  }
  if (info?.isDirectory()) return { local: { kind: 'dir' }, bytes: null };
  const folder = await stat(path.replace(/\.md$/i, '')).catch(() => null);
  if (folder?.isDirectory()) return { local: { kind: 'dir' }, bytes: null };
  return { local: { kind: 'missing' }, bytes: null };
}

// 백업 폴더 안 자리: {백업 폴더}/{홈 아래 경로}
function backupPathFor(path: string, options: PullOptions): string {
  const home = toHomePath(path, options.home);
  return join(options.backupDir, home.startsWith('~/') ? home.slice(2) : basename(path));
}

async function writeBackup(path: string, bytes: Uint8Array, options: PullOptions): Promise<string> {
  const target = backupPathFor(path, options);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
    // 같은 실행에서 같은 파일을 두 번 백업하면(경로 인자 중복) 먼저 것을 둔다
    if (error.code !== 'EEXIST') throw error;
  });
  return target;
}

// 같은 폴더의 임시 파일에 쓰고 이름을 바꾼다. 원래 파일의 권한을 지킨다
async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.lab-pull-${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: 'wx' });
    const mode = (await stat(path).catch(() => null))?.mode;
    if (mode !== undefined) await chmod(temp, mode & 0o7777);
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

// ---------- 문서 하나 ----------

function errorText(error: unknown, options?: { describeError?: (error: unknown) => string }): string {
  if (options?.describeError) return options.describeError(error);
  return error instanceof Error ? error.message : String(error);
}

// 폰 판 하나를 원본에 되돌린다
export async function pullDoc(docId: string, options: PullOptions): Promise<PullOutcome> {
  let md: PhoneMd;
  try {
    md = await fetchPhoneMd(options, docId);
  } catch (error) {
    const message = error instanceof PushError && error.status === 404 ? '서가에 md 문서가 없습니다.' : errorText(error, options);
    return { kind: 'failed', docId, title: docId, path: null, message };
  }
  const { title, rev } = md;
  const phoneBytes = Buffer.from(md.text, 'utf8');
  if (sha256Hex(phoneBytes) !== md.sha256) {
    return { kind: 'failed', docId, title, path: null, message: '받은 폰 판의 해시가 맞지 않습니다. 원본을 바꾸지 않았습니다.' };
  }
  const path = md.sourcePath ? absoluteSource(md.sourcePath, options.home) : null;
  if (md.pendingRev === null) return { kind: 'skipped', docId, title, path, reason: 'not-pending' };

  try {
    const source = path ? await readSource(path) : { local: { kind: 'missing' } as LocalSource, bytes: null };
    const decision = decidePull({
      sourcePath: md.sourcePath,
      local: source.local,
      macSha256: md.macSha256,
      phoneSha256: md.sha256,
    });
    if (decision.kind === 'skip') return { kind: 'skipped', docId, title, path, reason: decision.reason };
    const target = path as string;
    const original = source.bytes as Buffer;

    if (decision.kind === 'replace') {
      const backupPath = await writeBackup(target, original, options);
      // 바꾸기 직전에 원본을 다시 읽는다. 그사이 맥에서 고쳤으면 덮어쓰지 않는다(③으로 돌린다)
      const again = await readFile(target);
      if (sha256Hex(again) === sha256Hex(original)) {
        await writeAtomic(target, phoneBytes);
        return { kind: 'replaced', docId, title, path: target, rev, backupPath, ...(await notifyPulled(options, docId, md)) };
      }
      return conflict(docId, md, target, 'both-changed', again, options);
    }
    if (decision.kind === 'same') {
      return { kind: 'same', docId, title, path: target, rev, ...(await notifyPulled(options, docId, md)) };
    }
    return conflict(docId, md, target, decision.reason, original, options);
  } catch (error) {
    return { kind: 'failed', docId, title, path, message: errorText(error) };
  }
}

// 서버에 되돌림을 알린다. 실패하면 경고 글을 돌려준다(원본은 이미 폰 판이다)
async function notifyPulled(options: PullOptions, docId: string, md: PhoneMd): Promise<{ warning?: string }> {
  try {
    await reportPulled(options, docId, md.rev, md.sha256);
    return {};
  } catch (error) {
    if (error instanceof PushError && error.code === 'REV_CHANGED') {
      return { warning: '그사이 폰에서 다시 고쳤습니다. lab pull을 다시 하면 새 판이 충돌로 보일 수 있습니다(.phone.md를 보고 합칩니다).' };
    }
    return { warning: `서버에 알리지 못했습니다(${errorText(error)}). lab pull을 다시 하면 알립니다.` };
  }
}

// ③ 원본 옆에 {이름}.phone.md를 두고 차이 앞부분을 만든다. 이미 다른 .phone.md가 있으면 백업한 뒤 바꾼다
async function conflict(
  docId: string,
  md: PhoneMd,
  path: string,
  reason: 'both-changed' | 'unknown-base',
  original: Buffer,
  options: PullOptions,
): Promise<PullOutcome> {
  const phonePath = phoneCopyPath(path);
  const phoneBytes = Buffer.from(md.text, 'utf8');
  const existing = await readFile(phonePath).catch(() => null);
  if (existing && !existing.equals(phoneBytes)) await writeBackup(phonePath, existing, options);
  if (!existing || !existing.equals(phoneBytes)) await writeAtomic(phonePath, phoneBytes);
  return {
    kind: 'conflict',
    docId,
    title: md.title,
    path,
    rev: md.rev,
    reason,
    phonePath,
    diff: diffPreview(original.toString('utf8'), md.text),
  };
}

// ---------- 여러 문서 ----------

// 인자가 없으면 폰 판이 있는 문서 모두, 있으면 고른 원본 경로의 문서만 되돌린다
// - 경로 → 같은 문서 키(J8) → 문서 id. 서버 목록을 읽지 않는다
export async function pullTargets(paths: readonly string[], options: PullOptions): Promise<PullOutcome[]> {
  const outcomes: PullOutcome[] = [];
  if (paths.length === 0) {
    let docs: LibraryDocItem[];
    try {
      docs = await listPendingPulls(options);
    } catch (error) {
      return [{ kind: 'failed', docId: null, title: '폰 판 목록', path: null, message: errorText(error, options) }];
    }
    for (const doc of docs) outcomes.push(await pullDoc(doc.id, options));
    return outcomes;
  }
  const cwd = options.cwd ?? process.cwd();
  const seen = new Set<string>();
  for (const target of paths) {
    const absolute = target === '~' || target.startsWith('~/') ? join(options.home, target.slice(1)) : resolve(cwd, target);
    if (!toHomePath(absolute, options.home).startsWith('~/')) {
      outcomes.push({ kind: 'failed', docId: null, title: basename(absolute), path: absolute, message: '홈 폴더 밖 파일입니다.' });
      continue;
    }
    const docId = docIdForKey(docKeyFromSourcePath(absolute, options.home));
    if (seen.has(docId)) continue;
    seen.add(docId);
    const outcome = await pullDoc(docId, options);
    outcomes.push(outcome.kind === 'failed' && outcome.path === null ? { ...outcome, title: basename(absolute), path: absolute } : outcome);
  }
  return outcomes;
}
