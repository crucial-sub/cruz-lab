// 고치기 화면 스크립트 (서가 2단계 T6, Plan J36·J37, L9)
// - 글자 칸(textarea)의 md 원문을 고쳐 PUT /api/admin/library/docs/{id}/md { baseRev, text }로 저장한다.
// - 쓰는 중인 글은 기기에 임시 저장한다(localStorage, 문서 id + 판 번호). 실수로 나가도 글이 남는다.
//   - 같은 판의 임시 글이 있으면 그 글을 불러오고 "버리기"를 보인다.
//   - 다른 판의 임시 글(저장이 409로 막힌 뒤 새 판을 연 경우)이 있으면 "앞 판에서 고치던 글"과 복사·버리기를 보인다.
// - 줄 끝: 글자 칸의 값은 줄 끝이 늘 LF다. 원문이 CRLF였으면 저장할 때 CRLF로 되돌린다(원문을 바꾸지 않는다, L9).
// - 저장 결과: 성공·바뀐 것 없음 → md 뷰어로 간다. 409 REV_CHANGED → 덮어쓰지 않았다고 알리고 새 판 열기를 보인다.
//   401 → 로그인 화면(임시 글은 남는다). 그 밖의 실패 → 이유를 보인다(임시 글은 남는다).

const DRAFT_PREFIX = 'cruz-library:edit-draft:';
// 임시 저장을 미루는 시간 (글자마다 쓰지 않는다)
const DRAFT_DELAY_MS = 400;

// 기기 임시 저장 키
export function draftKey(docId: string, rev: number): string {
  return `${DRAFT_PREFIX}${docId}:${rev}`;
}

// 같은 문서의 다른 판 임시 저장 키
export function olderDraftKeys(keys: readonly string[], docId: string, rev: number): string[] {
  const prefix = `${DRAFT_PREFIX}${docId}:`;
  return keys.filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)) && key !== draftKey(docId, rev));
}

// 원문의 모든 줄 끝이 CRLF인가
export function usesCrlf(text: string): boolean {
  return text.includes('\r\n') && !/(^|[^\r])\n/.test(text);
}

// 글자 칸의 글 → 저장할 글. CRLF 원문이면 줄 끝을 CRLF로 되돌린다
export function restoreLineEndings(text: string, crlf: boolean): string {
  return crlf ? text.replace(/\r?\n/g, '\r\n') : text;
}

// 글자 칸에 그려 넣을 글: HTML은 <textarea> 바로 뒤 줄바꿈 하나를 버리므로 하나를 더 붙인다
export function textareaContent(text: string): string {
  return `\n${text.replace(/\r\n/g, '\n')}`;
}

// ---------- 화면 ----------

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 저장하지 못해도 화면의 글은 그대로다
  }
}

function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 막힌 브라우저에서는 지울 것도 없다
  }
}

function localKeys(): string[] {
  try {
    return Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i) ?? '');
  } catch {
    return [];
  }
}

// 상태 줄에 글과 (있으면) 링크 하나를 둔다. 글은 textContent로 넣는다
function setStatus(element: HTMLElement | null, text: string, tone: 'info' | 'error' = 'info', link?: { href: string; label: string }) {
  if (!element) return;
  element.replaceChildren(document.createTextNode(text));
  element.dataset.tone = tone;
  element.scrollIntoView({ block: 'nearest' });
  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.label;
    anchor.className = 'ml-2 font-medium text-brand underline';
    element.append(anchor);
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// 고치기 화면에서 한 번 부른다
export function setupEditView(): void {
  const root = document.querySelector<HTMLElement>('[data-edit-view]');
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-edit-text]');
  const saveButton = document.querySelector<HTMLButtonElement>('button[data-edit-save]');
  const cancelButton = document.querySelector<HTMLButtonElement>('button[data-edit-cancel]');
  const status = document.querySelector<HTMLElement>('[data-edit-status]');
  if (!root || !textarea || !saveButton) return;

  const docId = root.dataset.docId ?? '';
  const baseRev = Number(root.dataset.baseRev);
  const crlf = root.dataset.crlf === '1';
  const viewUrl = `/admin/library/d/${encodeURIComponent(docId)}`;
  const key = draftKey(docId, baseRev);
  const original = textarea.value;
  let saving = false;
  // 저장을 마쳤거나 취소해 이 화면을 떠나는 중이다. 떠날 때 pagehide가 임시 글을 다시 쓰지 않게 한다
  let leaving = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // 같은 판의 임시 글을 불러온다
  const draftNotice = document.querySelector<HTMLElement>('[data-edit-draft]');
  const saved = readLocal(key);
  if (saved !== null && saved !== original) {
    textarea.value = saved;
    if (draftNotice) draftNotice.hidden = false;
  }
  document.querySelector<HTMLButtonElement>('button[data-edit-draft-discard]')?.addEventListener('click', () => {
    textarea.value = original;
    removeLocal(key);
    if (draftNotice) draftNotice.hidden = true;
    textarea.focus();
  });

  // 다른 판에서 고치던 글: 복사하거나 버린다
  const olderNotice = document.querySelector<HTMLElement>('[data-edit-older]');
  const olderKeys = olderDraftKeys(localKeys(), docId, baseRev);
  const olderText = olderKeys.length > 0 ? readLocal(olderKeys[olderKeys.length - 1]) : null;
  if (olderNotice && olderText !== null) olderNotice.hidden = false;
  document.querySelector<HTMLButtonElement>('button[data-edit-older-copy]')?.addEventListener('click', async () => {
    if (olderText === null) return;
    setStatus(status, (await copyText(olderText)) ? '앞 판에서 고치던 글을 복사했습니다.' : '복사하지 못했습니다.');
  });
  document.querySelector<HTMLButtonElement>('button[data-edit-older-discard]')?.addEventListener('click', () => {
    for (const older of olderKeys) removeLocal(older);
    if (olderNotice) olderNotice.hidden = true;
  });

  // 쓰는 중인 글을 기기에 임시 저장한다. 원문과 같아지면 지운다
  const storeDraft = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (textarea.value === original) removeLocal(key);
    else writeLocal(key, textarea.value);
  };
  textarea.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(storeDraft, DRAFT_DELAY_MS);
  });
  window.addEventListener('pagehide', () => {
    if (!saving && !leaving) storeDraft();
  });

  async function save() {
    if (saving) return;
    saving = true;
    storeDraft();
    saveButton!.disabled = true;
    setStatus(status, '저장하는 중');
    try {
      const response = await fetch(`/api/admin/library/docs/${encodeURIComponent(docId)}/md`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRev, text: restoreLineEndings(textarea!.value, crlf) }),
      });
      if (response.status === 401) {
        window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const data = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (response.status === 409 && data?.error?.code === 'REV_CHANGED') {
        setStatus(
          status,
          '그사이 맥에서 새 판이 올라왔습니다. 덮어쓰지 않았습니다. 고친 글은 이 기기에 남아 있습니다.',
          'error',
          { href: window.location.pathname, label: '새 판 열기' },
        );
        return;
      }
      if (!response.ok) {
        setStatus(status, `저장하지 못했습니다: ${data?.error?.message ?? `(${response.status})`} 고친 글은 이 기기에 남아 있습니다.`, 'error');
        return;
      }
      leaving = true;
      if (timer) clearTimeout(timer);
      removeLocal(key);
      window.location.assign(viewUrl);
    } catch (error) {
      setStatus(
        status,
        `저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)} 고친 글은 이 기기에 남아 있습니다.`,
        'error',
      );
    } finally {
      saving = false;
      saveButton!.disabled = false;
    }
  }

  saveButton.addEventListener('click', () => void save());
  // 맥 키보드: ⌘S / Ctrl+S로 저장
  textarea.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  });

  cancelButton?.addEventListener('click', () => {
    if (textarea.value !== original && !window.confirm('고친 글을 버리고 나갈까요?')) return;
    if (timer) clearTimeout(timer);
    leaving = true;
    removeLocal(key);
    window.location.assign(viewUrl);
  });
}
