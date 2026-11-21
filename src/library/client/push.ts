// 맥 입구 공용 올리기 모듈 (서가 1단계 T8, Plan L2·J8·J15·J16, 5.2 [올리기])
// - 명령 lab push(scripts/lab.mjs)와 Raycast 확장(T9)이 같은 모듈을 쓴다.
// - planPush: 고른 경로(파일·폴더)를 올리기 작업으로 나눈다. 빠진 자산을 원본 폴더에서 찾아 함께 넣는다(J15).
// - pushJob: 올리기 시작 → 버킷으로 서명 PUT(서버가 준 머리 그대로) → 마무리. 서가 토큰은 부르는 쪽이 준다.
// - lab.mjs가 빌드 없이 Node(타입 지우기)로 가져온다. 그래서 상대 가져오기에 .ts를 붙이고, 지울 수 있는 TS 문법만 쓴다
//   (tests/library/node-load.test.ts). '@/…' 별칭도 쓰지 않는다.
// - 사용자 결정(2026-11-18): 고른 파일만 올린다. 같은 이름의 md·html이 옆에 있어도 고르지 않은 쪽은 올리지 않는다.
// - 폴더 2차 Plan J74: 문서가 여러 편이거나 모호한 폴더는 planPush가 NEEDS_CHOICE로 돌려준다.
//   입구가 사용자에게 물은 뒤 resolveFolderChoice로 작업을 만든다. 고르기를 모르는 입구는 실패로 다룬다.

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ENTRY_PATHS,
  toHomePath,
  validateManifest,
  type DocFormat,
  type ManifestError,
  type ManifestFile,
} from '../rules.ts';
import type { SharedByEntry } from '../share.ts';
import {
  analyzeJob,
  entryDroppedFiles,
  MAX_FOLDER_FILES,
  planCollection,
  planDrop,
  planEntry,
  textSourcesFor,
  traceAssets,
  type CollectionLimit,
  type CollectionPlan,
  type DropChoice,
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
// - NO_ENTRY_IN_FOLDER: 폴더 뿌리에 문서가 없다
// - EMPTY: 폴더에 받을 파일이 없다
// - NEEDS_CHOICE: 문서가 여러 편이거나 모호하다. 입구가 사용자에게 묻는다 (J74)
// - FOLDER_TOO_LARGE: 폴더 안 파일이 읽기 한도를 넘는다 (J66)
// - COLLECTION_LIMIT: 문서 모음이 한도를 넘는다 (J66)
// - BAD_ENTRY: 고른 진입 파일이 폴더 뿌리의 문서가 아니다 (J67)
export type PlanErrorCode =
  | 'NOT_FOUND'
  | 'OUTSIDE_HOME'
  | 'NOT_DOC'
  | 'NO_ENTRY_IN_FOLDER'
  | 'EMPTY'
  | 'NEEDS_CHOICE'
  | 'FOLDER_TOO_LARGE'
  | 'COLLECTION_LIMIT'
  | 'BAD_ENTRY';

// 사용자가 골라야 하는 폴더
// - skippedFiles: 받을 수 없는 이름·형식이라 빠진 파일
export interface NeedsChoicePlan {
  ok: false;
  target: string;
  error: 'NEEDS_CHOICE';
  choice: DropChoice;
  skippedFiles: string[];
}

// 모호한 폴더에서 고른 것: 문서 모음, 또는 문서 하나 + 진입 파일(뿌리의 파일 이름)
export type FolderSelection = { mode: 'each' } | { mode: 'entry'; entry: string };

// - collection: 문서 모음으로 고른 결과다. 입구가 QR 대신 목록을 보인다 (J79)
// - rootDocs: NO_ENTRY_IN_FOLDER일 때 폴더 뿌리의 html·md 개수. 오류 글이 막힌 이유를 알리는 데 쓴다
// - limit: COLLECTION_LIMIT일 때 넘은 한도
// - entryOptions: BAD_ENTRY일 때 고를 수 있는 진입 파일
export type TargetPlan =
  | { ok: true; target: string; jobs: PushJob[]; notes: PushNote[]; collection?: boolean }
  | NeedsChoicePlan
  | {
      ok: false;
      target: string;
      error: Exclude<PlanErrorCode, 'NEEDS_CHOICE'>;
      rootDocs?: RootDocCount;
      limit?: CollectionLimit;
      entryOptions?: string[];
    };

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
  const fail = (error: Exclude<PlanErrorCode, 'NEEDS_CHOICE'>): TargetPlan => ({ ok: false, target: absolute, error });

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
// - 따라가는 규칙은 traceAssets 하나다. 문서 모음도 같은 함수를 쓴다(J63). 그래서 어느 길로 올려도 자산이 같다
async function planFile(absPath: string, format: DocFormat, bytes: number, home: string): Promise<TargetPlan> {
  const root = dirname(absPath);
  const trace = await traceAssets<PushFile>(
    format,
    await readFile(absPath, 'utf8'),
    async (path) => {
      const assetAbs = join(root, path);
      const asset = await kindOf(assetAbs);
      return asset?.kind === 'file' ? { path, absPath: assetAbs, bytes: asset.bytes } : null;
    },
    (_path, file) => readFile(file.absPath, 'utf8'),
  );
  const files: PushFile[] = [{ path: ENTRY_PATHS[format], absPath, bytes }, ...trace.assets.map((asset) => asset.file)];
  return {
    ok: true,
    target: absPath,
    jobs: [{ format, sourcePath: toHomePath(absPath, home), fileName: basename(absPath).normalize('NFC'), files }],
    notes: trace.notes,
  };
}

// ---------- 폴더째 문서 (꼴 b) ----------

// 폴더 안 파일을 모은다. 숨은 파일·폴더(.DS_Store, .git/…)는 들어가지 않는다
// - 한도를 넘으면 null이다. 잘린 목록으로 판정하면 틀린 계획이 나온다(J66)
async function walkFolder(folder: string, prefix: string): Promise<PickedFile[] | null> {
  const picked: PickedFile[] = [];
  let overflow = false;
  const visit = async (dir: string, rel: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (overflow) return;
      if (entry.name.startsWith('.')) continue;
      const abs = join(dir, entry.name);
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) await visit(abs, childRel);
      else if (entry.isFile()) {
        if (picked.length >= MAX_FOLDER_FILES) {
          overflow = true;
          return;
        }
        picked.push({ path: childRel, bytes: (await stat(abs)).size });
      }
    }
  };
  await visit(folder, prefix);
  return overflow ? null : picked;
}

async function planFolder(
  folder: string,
  home: string,
  fail: (error: Exclude<PlanErrorCode, 'NEEDS_CHOICE'>) => TargetPlan,
): Promise<TargetPlan> {
  const parent = dirname(folder);
  const name = basename(folder);
  const walked = await walkFolder(folder, name);
  if (!walked) return fail('FOLDER_TOO_LARGE');
  // 서가 화면 올리기 계획(planDrop)과 같은 규칙으로 나눈다. 놓은 자리 = 폴더의 부모
  const plan = planDrop(walked);
  if (!plan.ok) {
    if (plan.error === 'NEEDS_CHOICE') {
      return { ok: false, target: folder, error: 'NEEDS_CHOICE', choice: plan.choice, skippedFiles: plan.skipped.map((file) => file.path) };
    }
    if (plan.error === 'EMPTY') return fail('EMPTY');
    // 막힌 이유를 알리도록 폴더 뿌리의 html·md 개수를 함께 준다
    return plan.rootDocs
      ? { ok: false, target: folder, error: 'NO_ENTRY_IN_FOLDER', rootDocs: plan.rootDocs }
      : fail('NO_ENTRY_IN_FOLDER');
  }

  const notes = new Notes();
  for (const skipped of plan.skipped) notes.add('skipped', skipped.path);
  const jobs = await analyzeJobs(plan.jobs, parent, home, notes);
  return { ok: true, target: folder, jobs, notes: notes.list };
}

// 작업마다 글자를 읽어 빠진 자산을 찾고(md 짝은 그림을 고르고) 맥 작업으로 바꾼다
async function analyzeJobs(uploadJobs: UploadJob[], parent: string, home: string, notes: Notes): Promise<PushJob[]> {
  const jobs: PushJob[] = [];
  for (const job of uploadJobs) {
    const texts = new Map<string, string>();
    for (const source of textSourcesFor(job)) texts.set(source, await readFile(join(parent, source), 'utf8'));
    const analysis = analyzeJob(job, (source) => texts.get(source));
    for (const path of analysis.missing) notes.add('missing', path);
    for (const ref of analysis.outside) notes.add('outside', ref);
    jobs.push(toPushJob(analysis.job, parent, home));
  }
  return jobs;
}

// ---------- 모호한 폴더 고르기 (J61·J67·J74) ----------

// 문서 모음으로 올릴 때의 계획. 입구가 고르기 전에 보여 준다. 올리지 않는다
export function previewCollection(plan: NeedsChoicePlan): Promise<CollectionPlan> {
  const parent = dirname(plan.target);
  const cache = new Map<string, Promise<string>>();
  const readText = (source: string) => {
    if (!cache.has(source)) cache.set(source, readFile(join(parent, source), 'utf8'));
    return cache.get(source) as Promise<string>;
  };
  // 자산은 파일로 올릴 때(planFile)와 같이 디스크에서 찾는다. 그래야 어느 길로 올려도 같은 문서다(J63)
  const name = basename(plan.target);
  const find = async (path: string) => {
    const asset = await kindOf(join(plan.target, path));
    return asset?.kind === 'file' ? { source: join(name, path), path, bytes: asset.bytes } : null;
  };
  return planCollection(plan.choice, readText, { find });
}

// 고른 대로 작업을 만든다
// - 문서 모음(each): 문서마다 자기 파일의 원본 경로를 쓴다. 같은 파일을 파일로 올린 문서와 같은 문서다(J61)
// - 문서 하나(entry): 폴더 키를 쓴다. 고른 파일이 진입 파일이다(J67)
export async function resolveFolderChoice(
  plan: NeedsChoicePlan,
  selection: FolderSelection,
  options: PlanOptions,
): Promise<TargetPlan> {
  const parent = dirname(plan.target);
  const notes = new Notes();
  for (const path of plan.skippedFiles) notes.add('skipped', path);

  if (selection.mode === 'each') {
    const collection = await previewCollection(plan);
    if (collection.limitError) {
      return { ok: false, target: plan.target, error: 'COLLECTION_LIMIT', limit: collection.limitError };
    }
    for (const doc of collection.docs) {
      for (const note of doc.notes) notes.add(note.kind, `${doc.name}: ${note.ref}`);
    }
    return {
      ok: true,
      target: plan.target,
      jobs: collection.jobs.map((job) => toPushJob(job, parent, options.home)),
      notes: notes.list,
      collection: true,
    };
  }

  let jobs: UploadJob[];
  try {
    jobs = planEntry(plan.choice, selection.entry);
  } catch {
    return { ok: false, target: plan.target, error: 'BAD_ENTRY', entryOptions: plan.choice.entryOptions };
  }
  for (const path of entryDroppedFiles(plan.choice, selection.entry)) notes.add('skipped', path);
  return { ok: true, target: plan.target, jobs: await analyzeJobs(jobs, parent, options.home, notes), notes: notes.list };
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
