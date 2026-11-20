// 맥 입구 공용 올리기 모듈 (서가 1단계 T8, Plan L2·J8·J15·J16, 5.2 [올리기])
// - 명령 lab push(scripts/lab.mjs)와 Raycast 확장(T9)이 같은 모듈을 쓴다.
// - planPush: 고른 경로(파일·폴더)를 올리기 작업으로 나눈다. 빠진 자산을 원본 폴더에서 찾아 함께 넣는다(J15).
// - pushJob: 올리기 시작 → 버킷으로 서명 PUT(서버가 준 머리 그대로) → 마무리. 서가 토큰은 부르는 쪽이 준다.
// - lab.mjs가 빌드 없이 Node(타입 지우기)로 가져온다. 그래서 상대 가져오기에 .ts를 붙이고, 지울 수 있는 TS 문법만 쓴다
//   (tests/library/node-load.test.ts). '@/…' 별칭도 쓰지 않는다.
// - 사용자 결정(2026-11-18): 고른 파일만 올린다. 같은 이름의 md·html이 옆에 있어도 고르지 않은 쪽은 올리지 않는다.

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { findCssRefs, findHtmlRefs, findMarkdownRefs, type RefScan } from '../refs.ts';
import {
  contentTypeForPath,
  ENTRY_PATHS,
  MAX_FILE_COUNT,
  toHomePath,
  validateManifest,
  type DocFormat,
  type ManifestError,
  type ManifestFile,
} from '../rules.ts';
import type { SharedByEntry } from '../share.ts';
import {
  analyzeJob,
  planDrop,
  textSourcesFor,
  type PickedFile,
  type RootDocCount,
  type UploadJob,
} from '../ui/upload-plan.ts';

// ---------- 계획 ----------

// 작업에 든 파일 하나
// - path: 문서 안 경로(서버에 보내는 값, NFC). 진입 파일은 index.html / index.md
// - absPath: 맥에서 읽을 절대 경로(디스크의 원래 이름)
export interface PushFile {
  path: string;
  absPath: string;
  bytes: number;
}

// 올리기 작업 하나 = 서버의 올리기 시작 요청 하나
// - sourcePath: ~/… 원본 경로. 서버가 끝의 .md·.html을 떼어 같은 문서 키를 만든다(J8)
// - fileName: 제목을 뽑지 못했을 때 쓰는 이름, 날짜를 뽑는 이름(J13)
export interface PushJob {
  format: DocFormat;
  sourcePath: string;
  fileName: string;
  files: PushFile[];
}

// 올리면서 알릴 것 (올리기는 계속한다)
// - missing: 문서가 가리키는데 원본 폴더에도 없다
// - outside: 문서 밖 주소(../ 로 뿌리 위, / 로 시작)
// - type: 받지 않는 형식이라 넣지 않았다
// - skipped: 넣을 수 없어 뺀 파일(이름이 진입 파일과 겹침, 폴더 안의 받지 않는 이름·형식)
export type PushNote = { kind: 'missing' | 'outside' | 'type' | 'skipped'; ref: string };

// 고른 경로를 받을 수 없는 이유
// - NOT_FOUND: 경로가 없다
// - OUTSIDE_HOME: 홈 폴더 밖이다(서버는 ~/… 원본 경로만 받는다)
// - NOT_DOC: md·html 파일이 아니다
// - NO_ENTRY_IN_FOLDER: 폴더 뿌리에서 진입 파일을 정할 수 없다
// - EMPTY: 폴더에 받을 파일이 없다
export type PlanErrorCode = 'NOT_FOUND' | 'OUTSIDE_HOME' | 'NOT_DOC' | 'NO_ENTRY_IN_FOLDER' | 'EMPTY';

// - rootDocs: NO_ENTRY_IN_FOLDER일 때 폴더 뿌리의 html·md 개수. 오류 글이 막힌 이유를 알리는 데 쓴다
export type TargetPlan =
  | { ok: true; target: string; jobs: PushJob[]; notes: PushNote[] }
  | { ok: false; target: string; error: PlanErrorCode; rootDocs?: RootDocCount };

export interface PlanOptions {
  home: string; // 홈 폴더 절대 경로
  cwd?: string; // 상대 경로를 풀 기준 (기본 process.cwd())
}

const DOC_EXTENSION = /\.(md|html)$/i;

function docFormatOf(name: string): DocFormat | null {
  const match = name.match(DOC_EXTENSION);
  return match ? (match[1].toLowerCase() as DocFormat) : null;
}

// 경로의 종류. 없으면 null
async function kindOf(path: string): Promise<{ kind: 'file' | 'dir'; bytes: number } | null> {
  try {
    const info = await stat(path);
    if (info.isFile()) return { kind: 'file', bytes: info.size };
    if (info.isDirectory()) return { kind: 'dir', bytes: 0 };
    return null;
  } catch {
    return null;
  }
}

// 알림 모음 (같은 알림은 한 번만)
class Notes {
  private readonly seen = new Set<string>();
  readonly list: PushNote[] = [];

  add(kind: PushNote['kind'], ref: string): void {
    const id = `${kind}\u0000${ref}`;
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.list.push({ kind, ref });
  }
}

// 고른 경로들 → 경로마다 계획
export async function planPush(targets: readonly string[], options: PlanOptions): Promise<TargetPlan[]> {
  const cwd = options.cwd ?? process.cwd();
  const plans: TargetPlan[] = [];
  for (const target of targets) {
    plans.push(await planTarget(target, options.home, cwd));
  }
  return plans;
}

async function planTarget(target: string, home: string, cwd: string): Promise<TargetPlan> {
  const absolute = target === '~' || target.startsWith('~/') ? join(home, target.slice(1)) : resolve(cwd, target);
  const fail = (error: PlanErrorCode): TargetPlan => ({ ok: false, target: absolute, error });

  const info = await kindOf(absolute);
  if (!info) return fail('NOT_FOUND');
  if (!toHomePath(absolute, home).startsWith('~/')) return fail('OUTSIDE_HOME');
  if (info.kind === 'dir') return planFolder(absolute, home, fail);

  const format = docFormatOf(absolute);
  if (!format) return fail('NOT_DOC');
  return planFile(absolute, format, info.bytes, home);
}

// ---------- 파일 하나 (꼴 a) ----------

// 진입 파일 하나 + 그것이 가리키는 자산을 원본 폴더에서 찾는다
// - md: md가 쓰는 그림만(링크는 넣지 않는다)
// - html: html·css가 가리키는 자산을 따라간다(css의 @import·url(), iframe html의 자산까지)
async function planFile(absPath: string, format: DocFormat, bytes: number, home: string): Promise<TargetPlan> {
  const root = dirname(absPath);
  const entryPath = ENTRY_PATHS[format];
  const notes = new Notes();
  const files: PushFile[] = [{ path: entryPath, absPath, bytes }];
  const included = new Set<string>([entryPath]);

  // 따라갈 글 파일: 문서 안 경로와 그 파일의 글
  const queue: { path: string | null; text: string }[] = [{ path: null, text: await readFile(absPath, 'utf8') }];
  while (queue.length > 0) {
    const item = queue.shift() as { path: string | null; text: string };
    const baseDir = item.path ? posix.dirname(item.path).replace(/^\.$/, '') : '';
    let scan: RefScan;
    if (item.path === null) scan = format === 'md' ? findMarkdownRefs(item.text) : findHtmlRefs(item.text);
    else scan = /\.css$/i.test(item.path) ? findCssRefs(item.text, baseDir) : findHtmlRefs(item.text, baseDir);

    for (const ref of scan.outside) notes.add('outside', ref);
    for (const path of scan.assets) {
      if (included.has(path)) {
        if (path === entryPath) notes.add('skipped', path);
        continue;
      }
      if (!contentTypeForPath(path)) {
        notes.add('type', path);
        continue;
      }
      const assetAbs = join(root, path);
      const asset = await kindOf(assetAbs);
      if (!asset || asset.kind !== 'file') {
        notes.add('missing', path);
        continue;
      }
      if (files.length > MAX_FILE_COUNT) break;
      included.add(path);
      files.push({ path, absPath: assetAbs, bytes: asset.bytes });
      // html 문서의 css·html 자산은 그 안의 주소도 따라간다
      if (format === 'html' && /\.(css|html)$/i.test(path)) queue.push({ path, text: await readFile(assetAbs, 'utf8') });
    }
  }

  return {
    ok: true,
    target: absPath,
    jobs: [{ format, sourcePath: toHomePath(absPath, home), fileName: basename(absPath).normalize('NFC'), files }],
    notes: notes.list,
  };
}

// ---------- 폴더째 문서 (꼴 b) ----------

// 폴더 안 파일을 모은다. 숨은 파일·폴더(.DS_Store, .git/…)는 들어가지 않는다
// - 파일이 받을 수 있는 수보다 많아지면 멈춘다. 넘친 목록은 올리기 전 검사(TOO_MANY_FILES)가 막는다
async function walkFolder(folder: string, prefix: string): Promise<PickedFile[]> {
  const picked: PickedFile[] = [];
  const visit = async (dir: string, rel: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (picked.length > MAX_FILE_COUNT) return;
      if (entry.name.startsWith('.')) continue;
      const abs = join(dir, entry.name);
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) await visit(abs, childRel);
      else if (entry.isFile()) picked.push({ path: childRel, bytes: (await stat(abs)).size });
    }
  };
  await visit(folder, prefix);
  return picked;
}

async function planFolder(folder: string, home: string, fail: (error: PlanErrorCode) => TargetPlan): Promise<TargetPlan> {
  const parent = dirname(folder);
  const name = basename(folder);
  // 서가 화면 올리기 계획(planDrop)과 같은 규칙으로 나눈다. 놓은 자리 = 폴더의 부모
  const plan = planDrop(await walkFolder(folder, name));
  if (!plan.ok) {
    if (plan.error === 'EMPTY') return fail('EMPTY');
    // 막힌 이유를 알리도록 폴더 뿌리의 html·md 개수를 함께 준다
    return plan.rootDocs
      ? { ok: false, target: folder, error: 'NO_ENTRY_IN_FOLDER', rootDocs: plan.rootDocs }
      : fail('NO_ENTRY_IN_FOLDER');
  }

  const notes = new Notes();
  for (const skipped of plan.skipped) notes.add('skipped', skipped.path);

  const jobs: PushJob[] = [];
  for (const job of plan.jobs) {
    const texts = new Map<string, string>();
    for (const source of textSourcesFor(job)) texts.set(source, await readFile(join(parent, source), 'utf8'));
    const analysis = analyzeJob(job, (source) => texts.get(source));
    for (const path of analysis.missing) notes.add('missing', path);
    for (const ref of analysis.outside) notes.add('outside', ref);
    jobs.push(toPushJob(analysis.job, parent, home));
  }
  return { ok: true, target: folder, jobs, notes: notes.list };
}

// 서가 화면 작업 → 맥 입구 작업
// - relativePath는 {폴더}.{형식}이다. 원본 경로도 형식 확장자를 붙여 보낸다(Plan 9절 4, PR #36 리뷰 I6)
function toPushJob(job: UploadJob, parent: string, home: string): PushJob {
  return {
    format: job.format,
    sourcePath: toHomePath(join(parent, job.relativePath), home),
    fileName: job.fileName,
    files: job.files.map((file) => ({ path: file.path, absPath: join(parent, file.source), bytes: file.bytes })),
  };
}

// ---------- 올리기 ----------

// 서가 토큰 API 실패 (올리기, 목록, 내리기 — client/docs.ts도 쓴다)
// - code: 서버 오류 코드(UNAUTHENTICATED, BAD_MANIFEST …) 또는 입구 코드(NETWORK, PUT_FAILED, CHANGED, BAD_RESPONSE)
// - status: HTTP 상태. 서버에 닿지 못했으면 null
export class PushError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: unknown;

  constructor(code: string, message: string, status: number | null = null, details?: unknown) {
    super(message);
    this.name = 'PushError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// 마무리 응답의 서가 문서 요약 (필요한 칸만 본다)
export interface PushedDoc {
  id: string;
  title: string;
  url: string; // 서가 문서 주소 (J7). QR 코드와 북마크가 쓴다
  // 이 문서를 덮는 살아 있는 공유 (서가 2단계 J52). 경고 줄은 share.ts sharedByLines가 만든다. 옛 서버면 빈 목록
  sharedBy: SharedByEntry[];
}

// 서가 토큰 API를 부를 때 필요한 것
export interface TokenApiOptions {
  server: string; // 블로그 출처 (예: https://www.cruzlab.dev)
  token: string; // 서가 토큰
  fetch?: typeof fetch;
}

export interface PushOptions extends TokenApiOptions {
  concurrency?: number; // 동시에 보내는 PUT 수 (기본 4)
  // 아직 되돌리지 않은 폰 판이 있어도 올린다 (서가 2단계 J42). 없으면 서버가 md를 409 PHONE_EDIT_PENDING으로 막는다
  force?: boolean;
  onProgress?: (sentFiles: number, totalFiles: number) => void;
}

interface StartResponse {
  docId: string;
  rev: number;
  uploads: { path: string; url: string; headers: Record<string, string> }[];
}

const DEFAULT_CONCURRENCY = 4;

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// 목록 검사 오류를 한 줄 글로
function describeManifestErrors(errors: readonly ManifestError[]): string {
  return errors.map((error) => (error.path ? `${error.code}: ${error.path}` : error.code)).join(', ');
}

// 서가 토큰 API 호출. 오류 응답 { error: { code, message } }는 PushError로 바꾼다
// - body가 있으면 JSON으로 보낸다(POST). 없으면 몸 없이 보낸다(GET, DELETE)
// - 204(몸 없음)는 null을 돌려준다
export async function callTokenApi<T>(
  options: TokenApiOptions,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const fetchFn = options.fetch ?? fetch;
  const url = `${options.server.replace(/\/+$/, '')}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${options.token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    throw new PushError('NETWORK', `서버에 닿지 못했습니다: ${url} (${error instanceof Error ? error.message : String(error)})`);
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = (data as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
    if (error && typeof error.code === 'string') {
      throw new PushError(error.code, typeof error.message === 'string' ? error.message : error.code, response.status, error.details);
    }
    throw new PushError(`HTTP_${response.status}`, `서버가 ${response.status}로 답했습니다: ${url}`, response.status);
  }
  if (response.status === 204) return null as T;
  if (data === null) throw new PushError('BAD_RESPONSE', `서버 응답을 읽지 못했습니다: ${url}`, response.status);
  return data as T;
}

// 일을 동시에 limit개씩 한다. 하나가 실패하면 남은 일을 시작하지 않는다
async function runPool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await work(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  });
  await Promise.all(workers);
}

// 작업 하나를 올린다: ① 시작 → ② PUT → ③ 마무리
export async function pushJob(job: PushJob, options: PushOptions): Promise<PushedDoc> {
  // 해시·크기는 실제로 읽은 내용으로 정한다(계획 뒤에 파일이 바뀌었을 수 있다)
  const manifest: ManifestFile[] = [];
  for (const file of job.files) {
    const bytes = await readFile(file.absPath);
    manifest.push({ path: file.path, bytes: bytes.byteLength, sha256: sha256Hex(bytes) });
  }
  const check = validateManifest(job.format, manifest);
  if (!check.ok) {
    throw new PushError('BAD_MANIFEST', `올릴 파일 목록이 올바르지 않습니다: ${describeManifestErrors(check.errors)}`, null, check.errors);
  }

  const start = await callTokenApi<StartResponse>(options, 'POST', '/api/library/token/uploads', {
    format: job.format,
    sourcePath: job.sourcePath,
    fileName: job.fileName,
    files: manifest,
    ...(options.force ? { force: true } : {}),
  });

  // 서버가 정규화한 경로로 돌려준다. 우리 경로도 NFC라 그대로 맞는다
  const byPath = new Map(job.files.map((file, index) => [file.path.normalize('NFC'), { file, sent: manifest[index] }]));
  const fetchFn = options.fetch ?? fetch;
  let sentFiles = 0;
  await runPool(start.uploads, options.concurrency ?? DEFAULT_CONCURRENCY, async (upload) => {
    const entry = byPath.get(upload.path.normalize('NFC'));
    if (!entry) throw new PushError('BAD_RESPONSE', `서버가 모르는 파일을 요청했습니다: ${upload.path}`);
    const bytes = await readFile(entry.file.absPath);
    if (bytes.byteLength !== entry.sent.bytes || sha256Hex(bytes) !== entry.sent.sha256) {
      throw new PushError('CHANGED', `올리는 동안 파일이 바뀌었습니다: ${entry.file.absPath}`);
    }
    let response: Response;
    try {
      // 서버가 준 머리를 그대로 보낸다. x-goog-if-generation-match: 0 이 빠지면 버킷이 400이다(서명에 든 머리)
      // Buffer는 BodyInit 타입이 아니다. ArrayBuffer를 가진 Uint8Array 사본으로 넘긴다
      response = await fetchFn(upload.url, { method: 'PUT', headers: upload.headers, body: new Uint8Array(bytes) });
    } catch (error) {
      throw new PushError('NETWORK', `저장소에 보내지 못했습니다: ${upload.path} (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!response.ok) {
      throw new PushError('PUT_FAILED', `저장소가 파일을 받지 않았습니다 (${response.status}): ${upload.path}`, response.status);
    }
    sentFiles += 1;
    options.onProgress?.(sentFiles, start.uploads.length);
  });

  const { doc, sharedBy } = await callTokenApi<{ doc: PushedDoc; sharedBy?: SharedByEntry[] }>(
    options,
    'POST',
    '/api/library/token/uploads/finalize',
    { docId: start.docId, rev: start.rev },
  );
  return { id: doc.id, title: doc.title, url: doc.url, sharedBy: Array.isArray(sharedBy) ? sharedBy : [] };
}
