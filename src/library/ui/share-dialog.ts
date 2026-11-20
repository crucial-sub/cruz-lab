// 공유 창 스크립트 (서가 2단계 T9, Plan J51)
// - 서가 목록(문서 줄, 프로젝트 묶음 머리)과 md 뷰어 머리줄의 "공유" 단추가 이 창을 연다. 단추의 data-* 값이 대상이다.
//   문서 하나: data-share-kind="doc", data-share-doc, data-share-title
//   프로젝트: data-share-kind="project", data-share-project, data-share-folders(폴더 목록 JSON)
// - 창: 범위(프로젝트면 "프로젝트 전체" 또는 그 안 폴더), 기간(1일·7일 기본·30일·끌 때까지) → 공유 주소 만들기 →
//   주소, 복사, QR. 목록의 "공유 중" 칸: 주소 복사, 끄기.
// - 서버 API: /api/admin/library/shares(관리자 쿠키, 같은 출처). 로그아웃이면 로그인 화면으로 보낸다.
// - DOM 없이 시험하는 부분(shareTargetFrom, shareRequestBody)과 화면 연결(setupShareDialog)을 나눈다.

import { DEFAULT_SHARE_DURATION, isShareDuration, type ShareDuration, type ShareScope } from '../share';

// 공유 대상 (단추가 가리키는 것)
export type ShareTarget =
  | { kind: 'doc'; docId: string; title: string }
  | { kind: 'project'; project: string; folders: string[]; title: string };

// 단추의 data-* 값 → 공유 대상. 값이 빠졌으면 null
export function shareTargetFrom(dataset: Record<string, string | undefined>): ShareTarget | null {
  if (dataset.shareKind === 'doc' && dataset.shareDoc) {
    return { kind: 'doc', docId: dataset.shareDoc, title: dataset.shareTitle ?? '' };
  }
  if (dataset.shareKind === 'project' && dataset.shareProject) {
    let folders: string[] = [];
    try {
      const parsed: unknown = JSON.parse(dataset.shareFolders ?? '[]');
      if (Array.isArray(parsed)) folders = parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      // 깨진 값이면 폴더 없이 프로젝트 전체만 고른다
    }
    return { kind: 'project', project: dataset.shareProject, folders, title: dataset.shareTitle ?? dataset.shareProject };
  }
  return null;
}

// 고른 범위·기간 → 공유 만들기 본문. folder가 빈 값이면 프로젝트 전체다. 모르는 기간은 기본(7일)
export function shareRequestBody(
  target: ShareTarget,
  folder: string,
  duration: string,
): { scope: ShareScope; duration: ShareDuration } {
  const chosen = isShareDuration(duration) ? duration : DEFAULT_SHARE_DURATION;
  if (target.kind === 'doc') return { scope: { kind: 'doc', docId: target.docId }, duration: chosen };
  const scope: ShareScope = folder ? { kind: 'folder', project: target.project, folder } : { kind: 'project', project: target.project };
  return { scope, duration: chosen };
}

// ---------- 화면 연결 ----------

interface CreatedShare {
  share: { id: string; url: string; label: string; remaining: string };
  qrSvg: string;
}

function redirectToLogin(): never {
  window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
  throw new Error('로그인이 필요합니다.');
}

// 공유 API 요청. 오류면 서버의 message로 던진다
async function shareApi<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? `요청이 실패했습니다 (${response.status}).`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

// 주소를 클립보드에 넣는다. 안 되면 칸을 골라 둔다. 단추 글을 2초 바꾼다
async function copyText(text: string, button: HTMLButtonElement, input?: HTMLInputElement | null): Promise<void> {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = '복사했습니다';
  } catch {
    input?.select();
    button.textContent = input ? '골라 두었습니다' : '복사하지 못했습니다';
  }
  window.setTimeout(() => (button.textContent = original), 2000);
}

// 공유 창을 연결한다. onChanged: 공유를 만들거나 끈 뒤 부른다(서가 목록이 "공유 중" 칸을 다시 받는다)
export function setupShareDialog(options: { onChanged?: () => void | Promise<void> } = {}): void {
  const dialog = document.getElementById('share-dialog') as HTMLDialogElement | null;
  if (!dialog) return;
  const q = <T extends Element>(selector: string) => dialog.querySelector<T>(selector);
  const form = q<HTMLFormElement>('[data-share-form]');
  const result = q<HTMLElement>('[data-share-result]');
  const targetLine = q<HTMLElement>('[data-share-target]');
  const scopeRow = q<HTMLElement>('[data-share-scope-row]');
  const scopeSelect = q<HTMLSelectElement>('[data-share-scope]');
  const errorLine = q<HTMLElement>('[data-share-error]');
  const submit = q<HTMLButtonElement>('[data-share-submit]');
  const urlInput = q<HTMLInputElement>('[data-share-url]');
  const qr = q<HTMLImageElement>('[data-share-qr]');
  let target: ShareTarget | null = null;
  let created = false;

  const open = (next: ShareTarget) => {
    target = next;
    created = false;
    if (targetLine) targetLine.textContent = next.kind === 'doc' ? `문서: ${next.title}` : `프로젝트: ${next.project}`;
    if (scopeSelect) {
      const choices = next.kind === 'project' ? next.folders : [];
      scopeSelect.replaceChildren(new Option('프로젝트 전체', ''), ...choices.map((folder) => new Option(`폴더: ${folder}`, folder)));
      scopeSelect.value = '';
    }
    if (scopeRow) scopeRow.hidden = next.kind !== 'project';
    for (const radio of dialog.querySelectorAll<HTMLInputElement>('input[name="share-duration"]')) {
      radio.checked = radio.value === DEFAULT_SHARE_DURATION;
    }
    if (errorLine) errorLine.hidden = true;
    if (form) form.hidden = false;
    if (result) result.hidden = true;
    if (submit) submit.disabled = false;
    dialog.showModal();
  };

  const create = async () => {
    if (!target || !submit) return;
    const duration = dialog.querySelector<HTMLInputElement>('input[name="share-duration"]:checked')?.value ?? DEFAULT_SHARE_DURATION;
    submit.disabled = true;
    if (errorLine) errorLine.hidden = true;
    try {
      const body = shareRequestBody(target, scopeSelect?.value ?? '', duration);
      const { share, qrSvg } = await shareApi<CreatedShare>('POST', '/api/admin/library/shares', body);
      created = true;
      if (urlInput) urlInput.value = share.url;
      if (qr) qr.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`;
      const summary = q<HTMLElement>('[data-share-summary]');
      if (summary) summary.textContent = `${share.label} · ${share.remaining}`;
      if (form) form.hidden = true;
      if (result) result.hidden = false;
    } catch (error) {
      submit.disabled = false;
      if (errorLine) {
        errorLine.textContent = `공유하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`;
        errorLine.hidden = false;
      }
    }
  };

  dialog.addEventListener('close', () => {
    if (created) void options.onChanged?.();
    created = false;
  });

  document.addEventListener('click', (event) => {
    const element = event.target as Element | null;
    const opener = element?.closest<HTMLElement>('[data-share-open]');
    if (opener) {
      const next = shareTargetFrom(opener.dataset);
      if (next) open(next);
      return;
    }
    const action = element?.closest<HTMLButtonElement>('button[data-share-action]');
    if (!action) return;
    const name = action.dataset.shareAction;
    if (name === 'create') void create();
    if (name === 'cancel' || name === 'close') dialog.close();
    if (name === 'copy' && urlInput) void copyText(urlInput.value, action, urlInput);
    // 목록 "공유 중" 칸의 단추
    const row = action.closest<HTMLElement>('[data-share-id]');
    if (name === 'copy-live' && row) void copyText(row.dataset.shareUrl ?? '', action);
    if (name === 'revoke' && row) void revoke(row, action, options.onChanged);
  });
}

// 공유를 끈다. 끈 뒤 목록을 다시 받는다
async function revoke(row: HTMLElement, button: HTMLButtonElement, onChanged?: () => void | Promise<void>): Promise<void> {
  const label = row.dataset.shareLabel ?? '';
  if (!window.confirm(`"${label}" 공유를 끕니다. 이 주소는 1분 안에 열리지 않습니다.`)) return;
  button.disabled = true;
  try {
    await shareApi('DELETE', `/api/admin/library/shares/${encodeURIComponent(row.dataset.shareId ?? '')}`);
    await onChanged?.();
  } catch (error) {
    button.disabled = false;
    window.alert(`공유를 끄지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}
