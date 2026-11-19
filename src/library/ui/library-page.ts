// 서가 화면 스크립트 (서가 1단계 T6, Plan 5.2 [올리기]·J14·J15·J20)
// - 올리기: 끌어다 놓기·파일 고르기·폴더 고르기 → 문서별 작업(upload-plan.ts) → 빠진 자산 확인 → 해시 →
//   올리기 시작(서명 주소) → 버킷에 바로 PUT → 마무리 → 결과(주소·QR).
// - 목록: QR 보기·주소 복사, 서가에서 내리기. 바뀐 뒤 이 페이지를 다시 받아 #library-list만 바꾼다.
// - 서버 API: /api/admin/library/**(관리자 쿠키, 같은 출처). 로그아웃이면 로그인 화면으로 보낸다.

import { isProjectName, validateManifest, type ManifestError } from '../rules';
import {
  analyzeJob,
  planDrop,
  textSourcesFor,
  type DropErrorCode,
  type JobAnalysis,
  type SkippedFile,
  type UploadJob,
} from './upload-plan';
import { isIosWebApp } from './list-view';

// 마지막에 고른 프로젝트 (L2: 마지막 값이 기본)
const LAST_PROJECT_KEY = 'cruz-library:last-project';
// 폴더를 끌어다 놓을 때 읽는 파일 수 한도. 실수로 큰 폴더(node_modules 등)를 놓았을 때 멈춘다
const MAX_WALK_FILES = 2000;
// 빠진 자산을 찾으려고 글자로 읽는 파일 크기 한도 5 MB
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
// 버킷에 동시에 보내는 파일 수
const PUT_CONCURRENCY = 4;

interface PickedEntry {
  path: string;
  file: File;
}

interface StartResponse {
  docId: string;
  rev: number;
  uploads: { path: string; url: string; headers: Record<string, string> }[];
}

interface DocSummary {
  id: string;
  title: string;
  url: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

// ---------- 공용 ----------

// 로그인 화면으로 보낸다. 로그인 뒤 이 화면으로 돌아온다
function redirectToLogin(): never {
  window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
  throw new Error('로그인이 필요합니다.');
}

// 서가 API 요청. 오류 응답이면 서버의 message로 던진다
async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const code = data?.error?.code;
    if (code === 'LIBRARY_NOT_CONFIGURED') throw new Error('서가 저장소 설정(LIBRARY_BUCKET)이 없습니다.');
    throw new Error(data?.error?.message ?? `요청이 실패했습니다 (${response.status}).`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const readLocal = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocal = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 개인 정보 보호 모드 등: 기억하지 못해도 올리기는 된다
  }
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 글자와 자식으로 요소를 만든다 (사용자 값은 textContent로만 넣는다)
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string } = {},
  ...children: (Node | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const child of children) if (child) node.append(child);
  return node;
}

const BUTTON = 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg-card';
const PRIMARY = 'rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-hover';

// ---------- 파일 모으기 ----------

// 끌어다 놓은 항목에서 파일을 모은다. 폴더는 안까지 읽는다(숨은 폴더는 건너뛴다)
// - webkitGetAsEntry는 drop 처리기 안에서 기다리기 전에 불러야 한다. 그래서 항목을 먼저 모두 받는다
function entriesOf(transfer: DataTransfer): FileSystemEntry[] {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  return entries;
}

async function walkEntries(entries: FileSystemEntry[]): Promise<PickedEntry[]> {
  const out: PickedEntry[] = [];
  const visit = async (entry: FileSystemEntry): Promise<void> => {
    if (out.length > MAX_WALK_FILES) throw new Error(`파일이 ${MAX_WALK_FILES}개를 넘습니다. 문서 폴더만 놓습니다.`);
    if (entry.name.startsWith('.')) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ path: entry.fullPath.replace(/^\/+/, ''), file });
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const child of batch) await visit(child);
      }
    }
  };
  for (const entry of entries) await visit(entry);
  return out;
}

function entriesFromInput(input: HTMLInputElement): PickedEntry[] {
  return Array.from(input.files ?? []).map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}

// ---------- 알림 글 ----------

const DROP_ERRORS: Record<DropErrorCode, string> = {
  EMPTY: '올릴 수 있는 파일이 없습니다.',
  NO_DOC: 'md 또는 html 문서가 없습니다.',
  NO_ENTRY_IN_FOLDER: '폴더 뿌리에 index.html이 없습니다. 진입 파일 하나를 정할 수 없습니다.',
  MIXED: '여러 문서와 자산이 섞여 있습니다. 문서마다 따로 놓습니다.',
};

const SKIP_REASONS: Record<SkippedFile['reason'], string> = {
  hidden: '숨은 파일',
  name: '받을 수 없는 이름',
  type: '받지 않는 형식',
};

const MANIFEST_ERRORS: Record<ManifestError['code'], string> = {
  EMPTY: '파일이 없습니다',
  TOO_MANY_FILES: '파일이 500개를 넘습니다',
  BAD_PATH: '받을 수 없는 경로',
  BAD_TYPE: '받지 않는 형식',
  BAD_HASH: '해시가 틀렸습니다',
  BAD_SIZE: '크기가 틀렸습니다',
  FILE_TOO_LARGE: '파일 하나가 100 MB를 넘습니다',
  TOTAL_TOO_LARGE: '모두 합쳐 200 MB를 넘습니다',
  DUPLICATE_PATH: '같은 경로가 두 번 있습니다',
  NO_ENTRY: '진입 파일이 없습니다',
};

function describeManifestErrors(errors: ManifestError[]): string {
  return errors
    .slice(0, 5)
    .map((error) => `${MANIFEST_ERRORS[error.code]}${error.path ? `: ${error.path}` : ''}`)
    .join(', ');
}

// ---------- 상태 칸 ----------

const statusBox = () => $<HTMLDivElement>('upload-status');

function clearStatus() {
  statusBox()?.replaceChildren();
}

function showMessage(text: string, tone: 'error' | 'info' = 'info') {
  statusBox()?.append(
    el('p', {
      class: tone === 'error' ? 'text-sm text-red-500' : 'text-sm text-text-secondary',
      text,
    }),
  );
}

function showSkipped(skipped: SkippedFile[]) {
  const visible = skipped.filter((file) => file.reason !== 'hidden');
  if (visible.length === 0) return;
  const list = el('ul', { class: 'mt-1 list-disc pl-5' });
  for (const file of visible.slice(0, 10)) list.append(el('li', { text: `${file.path} (${SKIP_REASONS[file.reason]})` }));
  if (visible.length > 10) list.append(el('li', { text: `그 밖 ${visible.length - 10}개` }));
  statusBox()?.append(el('div', { class: 'text-xs text-text-secondary' }, el('p', { text: '올리지 않는 파일:' }), list));
}

// 빠진 자산 경고. 사용자가 "그대로 올리기"를 고르면 true
function confirmMissing(analyses: JobAnalysis[]): Promise<boolean> {
  return new Promise((resolve) => {
    const box = el('div', { class: 'rounded-lg border border-amber-500/50 px-4 py-3 text-sm' });
    box.append(el('p', { class: 'font-medium', text: '문서가 가리키는데 놓은 파일에 없는 것이 있습니다.' }));
    for (const analysis of analyses) {
      const items = [
        ...analysis.missing.map((path) => `빠짐: ${path}`),
        ...analysis.outside.map((ref) => `문서 밖 주소: ${ref}`),
      ];
      if (items.length === 0) continue;
      const list = el('ul', { class: 'mt-1 list-disc pl-5 text-xs text-text-secondary' });
      for (const item of items.slice(0, 15)) list.append(el('li', { class: 'break-all', text: item }));
      if (items.length > 15) list.append(el('li', { text: `그 밖 ${items.length - 15}개` }));
      box.append(el('p', { class: 'mt-2 text-xs', text: `${analysis.job.format} · ${analysis.job.fileName}` }), list);
    }
    box.append(
      el('p', {
        class: 'mt-2 text-xs text-text-secondary',
        text: '자산 폴더를 함께 놓으면 고쳐집니다. 그대로 올리면 그 그림·파일은 빈 채로 보입니다.',
      }),
    );
    const cancel = el('button', { class: BUTTON, text: '취소' });
    const go = el('button', { class: PRIMARY, text: '그대로 올리기' });
    cancel.type = 'button';
    go.type = 'button';
    const done = (value: boolean) => {
      box.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => done(false));
    go.addEventListener('click', () => done(true));
    box.append(el('div', { class: 'mt-3 flex justify-end gap-2' }, cancel, go));
    statusBox()?.append(box);
    go.focus();
  });
}

// 작업 하나의 진행 줄
function jobLine(job: UploadJob) {
  const total = job.files.reduce((sum, file) => sum + file.bytes, 0);
  const label = el('p', {
    class: 'truncate text-sm',
    text: `${job.format} · ${job.fileName} · 파일 ${job.files.length}개 · ${formatBytes(total)}`,
  });
  const state = el('p', { class: 'text-xs text-text-secondary', text: '준비 중' });
  const bar = el('progress', { class: 'h-1.5 w-full' });
  bar.max = 1;
  bar.value = 0;
  const box = el('div', { class: 'rounded-lg border border-border px-4 py-3' }, label, bar, state);
  statusBox()?.append(box);
  return {
    box,
    set(text: string, ratio?: number) {
      state.textContent = text;
      if (ratio !== undefined) bar.value = ratio;
    },
  };
}

// 올린 결과: 제목, 열기 링크, QR 코드
function showResult(line: ReturnType<typeof jobLine>, doc: DocSummary) {
  const open = el('a', { class: 'text-sm text-brand underline', text: '열기' });
  open.href = `/admin/library/d/${encodeURIComponent(doc.id)}`;
  const qr = el('img', { class: 'size-36 rounded-md bg-white' });
  qr.alt = '서가 문서 주소 QR 코드';
  qr.width = 144;
  qr.height = 144;
  qr.src = `/api/admin/library/docs/${encodeURIComponent(doc.id)}/qr`;
  line.box.replaceChildren(
    el(
      'div',
      { class: 'flex items-start gap-3' },
      qr,
      el(
        'div',
        { class: 'min-w-0 flex-1' },
        el('p', { class: 'text-xs text-brand', text: '올렸습니다' }),
        el('p', { class: 'mt-0.5 break-words font-medium', text: doc.title }),
        el('p', { class: 'mt-1 break-all text-xs text-text-secondary', text: doc.url }),
        el('p', { class: 'mt-2' }, open),
      ),
    ),
  );
}

// ---------- 올리기 ----------

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// 서명 주소로 버킷에 PUT한다. XMLHttpRequest라 진행률을 받는다. 헤더는 서버가 준 것만 보낸다
function putFile(url: string, file: File, headers: Record<string, string>, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
      } else reject(new Error(`저장소가 파일을 받지 않았습니다 (${xhr.status}).`));
    };
    // 서가 버킷의 CORS 설정(E1)이 없으면 여기로 온다
    xhr.onerror = () => reject(new Error('저장소에 보내지 못했습니다. 서가 버킷의 CORS 설정을 확인합니다.'));
    xhr.onabort = () => reject(new Error('올리기가 멈췄습니다.'));
    xhr.send(file);
  });
}

// 일을 동시에 limit개씩 한다
async function runPool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await work(item);
    }
  });
  await Promise.all(workers);
}

async function uploadJob(job: UploadJob, project: string, files: Map<string, File>): Promise<DocSummary> {
  const line = jobLine(job);
  try {
    line.set('해시 계산 중');
    const manifest = [];
    for (const file of job.files) {
      const blob = files.get(file.source);
      if (!blob) throw new Error(`파일을 다시 읽지 못했습니다: ${file.path}`);
      manifest.push({ path: file.path, bytes: blob.size, sha256: await sha256Hex(blob) });
    }
    const check = validateManifest(job.format, manifest);
    if (!check.ok) throw new Error(describeManifestErrors(check.errors));

    line.set('올리기 시작');
    const start = await api<StartResponse>('POST', '/api/admin/library/uploads', {
      format: job.format,
      project,
      relativePath: job.relativePath,
      fileName: job.fileName,
      files: manifest,
    });

    const sourceOf = new Map(job.files.map((file) => [file.path, file.source]));
    const total = manifest.reduce((sum, file) => sum + file.bytes, 0) || 1;
    const loaded = new Map<string, number>();
    const report = () => {
      const sum = [...loaded.values()].reduce((a, b) => a + b, 0);
      line.set(`보내는 중 ${Math.round((sum / total) * 100)}%`, sum / total);
    };
    await runPool(start.uploads, PUT_CONCURRENCY, async (upload) => {
      const source = sourceOf.get(upload.path);
      const blob = source ? files.get(source) : undefined;
      if (!blob) throw new Error(`파일을 다시 읽지 못했습니다: ${upload.path}`);
      await putFile(upload.url, blob, upload.headers, (bytes) => {
        loaded.set(upload.path, bytes);
        report();
      });
    });

    line.set('마무리 중', 1);
    const { doc } = await api<{ doc: DocSummary }>('POST', '/api/admin/library/uploads/finalize', {
      docId: start.docId,
      rev: start.rev,
    });
    showResult(line, doc);
    return doc;
  } catch (error) {
    line.set(`실패: ${error instanceof Error ? error.message : String(error)}`);
    line.box.classList.add('border-red-500/50');
    throw error;
  }
}

// 고른 프로젝트. 틀리면 null(입력 칸에 알린다)
function chosenProject(): string | null {
  const input = $<HTMLInputElement>('upload-project');
  const value = input?.value.trim().normalize('NFC') ?? '';
  if (!isProjectName(value)) {
    showMessage('프로젝트 이름을 적습니다. 영문·숫자·한글·-·_·. 64자까지입니다.', 'error');
    input?.focus();
    return null;
  }
  return value;
}

let busy = false;

// 모은 파일을 올린다: 계획 → 빠진 자산 확인 → 작업마다 올리기 → 목록 새로 그리기
async function handlePicked(picked: PickedEntry[]) {
  if (busy) return;
  clearStatus();
  const project = chosenProject();
  if (!project) return;
  if (!globalThis.crypto?.subtle) {
    showMessage('이 주소에서는 파일 해시를 만들 수 없습니다(https가 필요합니다).', 'error');
    return;
  }

  const plan = planDrop(picked.map(({ path, file }) => ({ path, bytes: file.size })));
  showSkipped(plan.skipped);
  if (!plan.ok) {
    showMessage(DROP_ERRORS[plan.error], 'error');
    return;
  }

  busy = true;
  try {
    const files = new Map(picked.map(({ path, file }) => [path, file]));
    // 빠진 자산을 찾으려고 진입 파일·css·html을 글자로 읽는다
    const texts = new Map<string, string>();
    for (const job of plan.jobs) {
      for (const source of textSourcesFor(job)) {
        const file = files.get(source);
        if (file && file.size <= MAX_TEXT_BYTES && !texts.has(source)) texts.set(source, await file.text());
      }
    }
    const analyses = plan.jobs.map((job) => analyzeJob(job, (source) => texts.get(source)));
    if (analyses.some((analysis) => analysis.missing.length > 0 || analysis.outside.length > 0)) {
      if (!(await confirmMissing(analyses))) {
        showMessage('올리지 않았습니다.');
        return;
      }
    }

    writeLocal(LAST_PROJECT_KEY, project);
    let failed = 0;
    for (const analysis of analyses) {
      try {
        await uploadJob(analysis.job, project, files);
      } catch (error) {
        failed += 1;
        console.error('[library] 올리기 실패', error);
      }
    }
    if (failed < analyses.length) await refreshList();
  } finally {
    busy = false;
  }
}

// ---------- 목록 ----------

// 이 페이지를 다시 받아 목록과 프로젝트 후보를 바꾼다
// - 검색어(?q=)를 함께 보낸다. 검색 결과 화면이면 같은 검색 결과를 다시 받는다(서가 2단계 T2)
async function refreshList() {
  const response = await fetch(window.location.pathname + window.location.search, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.redirected && new URL(response.url).pathname.startsWith('/admin/login')) redirectToLogin();
  if (!response.ok) return;
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  for (const id of ['library-list', 'library-projects']) {
    const fresh = page.getElementById(id);
    const current = document.getElementById(id);
    if (fresh && current) current.replaceWith(document.importNode(fresh, true));
  }
}

function openQr(row: HTMLElement) {
  const dialog = $<HTMLDialogElement>('qr-dialog');
  if (!dialog) return;
  const id = row.dataset.docId ?? '';
  ($('qr-title') as HTMLElement).textContent = row.dataset.docTitle ?? '';
  ($<HTMLImageElement>('qr-image') as HTMLImageElement).src = `/api/admin/library/docs/${encodeURIComponent(id)}/qr`;
  ($<HTMLInputElement>('qr-url') as HTMLInputElement).value = row.dataset.docUrl ?? '';
  dialog.showModal();
}

async function copyQrUrl(button: HTMLButtonElement) {
  const input = $<HTMLInputElement>('qr-url');
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
    button.textContent = '복사했습니다';
  } catch {
    // 클립보드 API가 없으면 칸을 골라 둔다(사용자가 직접 복사한다)
    input.select();
    button.textContent = '골라 두었습니다';
  }
  window.setTimeout(() => (button.textContent = '주소 복사'), 2000);
}

async function removeDoc(row: HTMLElement, button: HTMLButtonElement) {
  const title = row.dataset.docTitle ?? '';
  if (!window.confirm(`"${title}"을(를) 서가에서 내립니다. 원본은 맥에 그대로 있습니다.`)) return;
  button.disabled = true;
  try {
    await api('DELETE', `/api/admin/library/docs/${encodeURIComponent(row.dataset.docId ?? '')}`);
    await refreshList();
  } catch (error) {
    button.disabled = false;
    // 내리기는 문서 기록을 마지막에 지운다. 다시 누르면 남은 것을 이어서 지운다(store.ts removeLibraryDocWith)
    window.alert(
      `내리지 못했습니다: ${error instanceof Error ? error.message : String(error)}\n다시 누르면 남은 것을 이어서 지웁니다.`,
    );
  }
}

// 고정하거나 고정을 푼다 (서가 2단계 J34). 바뀐 뒤 목록을 다시 받는다(고정 칸이 바뀐다)
async function togglePin(row: HTMLElement, button: HTMLButtonElement) {
  const pinned = button.getAttribute('aria-pressed') === 'true';
  button.disabled = true;
  try {
    await api(pinned ? 'DELETE' : 'PUT', `/api/admin/library/docs/${encodeURIComponent(row.dataset.docId ?? '')}/pin`);
    await refreshList();
  } catch (error) {
    button.disabled = false;
    window.alert(`${pinned ? '고정을 풀지' : '고정하지'} 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------- 연결 ----------

function init() {
  // 아이폰 홈 화면 웹 앱으로 열렸으면 Safari 바로가기로 다시 추가하라고 알린다 (서가 2단계 J23)
  const notice = document.querySelector<HTMLElement>('[data-webapp-notice]');
  if (notice && isIosWebApp(window.navigator as { standalone?: unknown })) notice.hidden = false;

  const project = $<HTMLInputElement>('upload-project');
  if (project && !project.value) project.value = readLocal(LAST_PROJECT_KEY) ?? '';

  const filesInput = $<HTMLInputElement>('upload-files');
  const folderInput = $<HTMLInputElement>('upload-folder');
  for (const input of [filesInput, folderInput]) {
    input?.addEventListener('change', () => {
      const picked = entriesFromInput(input);
      input.value = '';
      if (picked.length > 0) void handlePicked(picked);
    });
  }

  const drop = $<HTMLDivElement>('upload-drop');
  if (drop) {
    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.dataset.over = 'true';
    });
    drop.addEventListener('dragleave', () => delete drop.dataset.over);
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      delete drop.dataset.over;
      if (!event.dataTransfer) return;
      const entries = entriesOf(event.dataTransfer);
      const fallback = Array.from(event.dataTransfer.files, (file) => ({ path: file.name, file }));
      void (async () => {
        try {
          await handlePicked(entries.length > 0 ? await walkEntries(entries) : fallback);
        } catch (error) {
          clearStatus();
          showMessage(error instanceof Error ? error.message : String(error), 'error');
        }
      })();
    });
  }
  // 칸 밖에 놓아 브라우저가 파일을 열어 버리지 않게 한다
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  // 문서를 열고 뒤로 돌아오면 브라우저가 옛 화면을 그대로 꺼낼 수 있다(뒤로-앞으로 캐시).
  // 그때 목록을 새로 받아 "읽음"을 보인다 (J14)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void refreshList();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const pick = target?.closest<HTMLElement>('[data-pick]');
    if (pick) {
      (pick.dataset.pick === 'folder' ? folderInput : filesInput)?.click();
      return;
    }
    const action = target?.closest<HTMLButtonElement>('button[data-action]');
    const row = action?.closest<HTMLElement>('[data-doc-id]');
    if (action && row) {
      if (action.dataset.action === 'qr') openQr(row);
      if (action.dataset.action === 'remove') void removeDoc(row, action);
      if (action.dataset.action === 'pin') void togglePin(row, action);
      return;
    }
    const qr = target?.closest<HTMLButtonElement>('button[data-qr]');
    if (qr?.dataset.qr === 'copy') void copyQrUrl(qr);
    if (qr?.dataset.qr === 'close') $<HTMLDialogElement>('qr-dialog')?.close();
  });
}

init();
